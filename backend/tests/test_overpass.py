"""
Overpass fetch behaviour, with the network replaced by fakes.

Run from backend/:  venv/Scripts/python -m pytest -q
"""

import asyncio
import time

import emergency_service as es


ROUTE = [[[76.26, 9.93], [76.27, 9.94], [76.28, 9.95]]]

HOSPITAL = {
    "type": "node", "id": 1, "lat": 9.94, "lon": 76.27,
    "tags": {"amenity": "hospital", "name": "Test Hospital"},
}

PRIMARY = es.PRIMARY_SERVER
FALLBACK_1, FALLBACK_2 = es.FALLBACK_SERVERS


def fake_servers(monkeypatch, behaviour, hedge=0.05, deadline=1.0):
    """behaviour: url -> (delay_seconds, response dict or Exception)"""

    calls = []

    async def fake_post(client, url, query):
        calls.append(url)
        delay, result = behaviour[url]
        await asyncio.sleep(delay)

        if isinstance(result, Exception):
            raise result

        # Same remark check as the real _post.
        remark = result.get("remark") or ""
        if "error" in remark.lower():
            raise ValueError(remark)

        return result

    monkeypatch.setattr(es, "_post", fake_post)
    monkeypatch.setattr(es, "HEDGE_DELAY_S", hedge)
    monkeypatch.setattr(es, "DEADLINE_S", deadline)
    monkeypatch.setattr(es, "_context_cache", es.TTLCache(ttl_seconds=60))

    return calls


def run(mode="walking"):
    return asyncio.run(es.get_route_context(ROUTE, mode))


def test_primary_success(monkeypatch):
    fake_servers(monkeypatch, {
        PRIMARY: (0, {"elements": [HOSPITAL]}),
        FALLBACK_1: (0, {"elements": []}),
        FALLBACK_2: (0, {"elements": []}),
    })

    context = run()

    assert context["emergency_available"] is True
    assert [s["name"] for s in context["emergency"]] == ["Test Hospital"]


def test_single_empty_200_is_not_trusted(monkeypatch):
    # The bug seen with driving routes: HTTP 200 with zero elements.
    fake_servers(monkeypatch, {
        PRIMARY: (0, {"elements": []}),
        FALLBACK_1: (0, RuntimeError("504 Gateway Timeout")),
        FALLBACK_2: (0, RuntimeError("504 Gateway Timeout")),
    })

    assert run()["emergency_available"] is False


def test_empty_result_replaced_by_real_data_from_fallback(monkeypatch):
    fake_servers(monkeypatch, {
        PRIMARY: (0, {"elements": []}),
        FALLBACK_1: (0.02, {"elements": [HOSPITAL]}),
        FALLBACK_2: (0.5, RuntimeError("slow")),
    })

    context = run()

    assert context["emergency_available"] is True
    assert len(context["emergency"]) == 1


def test_two_servers_agreeing_on_empty_is_trusted(monkeypatch):
    # e.g. a genuinely rural route with nothing mapped nearby.
    fake_servers(monkeypatch, {
        PRIMARY: (0, {"elements": []}),
        FALLBACK_1: (0.01, {"elements": []}),
        FALLBACK_2: (0.5, RuntimeError("slow")),
    })

    context = run()

    assert context["emergency_available"] is True
    assert context["emergency"] == []


def test_timeout_remark_is_a_failure(monkeypatch):
    timed_out = {
        "elements": [],
        "remark": 'runtime error: Query timed out in "query" at line 1 after 18 seconds.',
    }

    fake_servers(monkeypatch, {
        PRIMARY: (0, timed_out),
        FALLBACK_1: (0, timed_out),
        FALLBACK_2: (0, timed_out),
    })

    assert run()["emergency_available"] is False


def test_slow_primary_is_hedged_by_fallback(monkeypatch):
    calls = fake_servers(monkeypatch, {
        PRIMARY: (5, {"elements": [HOSPITAL]}),
        FALLBACK_1: (0.01, {"elements": [HOSPITAL]}),
        FALLBACK_2: (5, RuntimeError("slow")),
    }, hedge=0.05, deadline=4.0)

    start = time.monotonic()
    context = run()
    elapsed = time.monotonic() - start

    assert context["emergency_available"] is True
    assert FALLBACK_1 in calls
    # The primary takes 5 s; creating the HTTPS client alone costs a
    # few hundred ms on Windows, so allow for that but no more.
    assert elapsed < 2.0, "should not wait for the slow primary"


def test_deadline_marks_unavailable(monkeypatch):
    fake_servers(monkeypatch, {
        PRIMARY: (5, {"elements": [HOSPITAL]}),
        FALLBACK_1: (5, {"elements": [HOSPITAL]}),
        FALLBACK_2: (5, {"elements": [HOSPITAL]}),
    }, hedge=0.05, deadline=0.3)

    start = time.monotonic()
    context = run()

    assert context["emergency_available"] is False
    # Servers take 5 s; we must give up long before (allowing for
    # HTTPS client start-up on a loaded Windows machine).
    assert time.monotonic() - start < 2.5


def test_unavailable_result_is_not_cached(monkeypatch):
    behaviour = {
        PRIMARY: (0, RuntimeError("down")),
        FALLBACK_1: (0, RuntimeError("down")),
        FALLBACK_2: (0, RuntimeError("down")),
    }
    fake_servers(monkeypatch, behaviour)

    assert run()["emergency_available"] is False

    behaviour[PRIMARY] = (0, {"elements": [HOSPITAL]})

    assert run()["emergency_available"] is True


def test_emergency_and_street_data_fail_independently(monkeypatch):
    # The heavy street query times out; the light emergency query
    # still succeeds and must still be used.
    async def fake_fetch(query):
        if '"shop"' in query:
            return None
        return {"elements": [HOSPITAL]}

    monkeypatch.setattr(es, "_fetch_with_fallbacks", fake_fetch)
    monkeypatch.setattr(es, "_context_cache", es.TTLCache(ttl_seconds=60))

    context = run()

    assert context["emergency_available"] is True
    assert context["street_available"] is False
    assert len(context["emergency"]) == 1
    assert context["activity"] == []


def test_busy_primary_is_retried_once(monkeypatch):
    attempts = {"primary": 0}

    async def fake_post(client, url, query):
        if url == PRIMARY:
            attempts["primary"] += 1
            if attempts["primary"] == 1:
                raise RuntimeError("504 dispatcher busy")
            return {"elements": [HOSPITAL]}
        await asyncio.sleep(5)
        raise RuntimeError("fallback down")

    monkeypatch.setattr(es, "_post", fake_post)
    monkeypatch.setattr(es, "HEDGE_DELAY_S", 0.05)
    monkeypatch.setattr(es, "DEADLINE_S", 3.0)
    monkeypatch.setattr(es, "RETRY_DELAY_S", 0.05)
    monkeypatch.setattr(es, "RETRY_MIN_REMAINING_S", 0.5)
    monkeypatch.setattr(es, "_context_cache", es.TTLCache(ttl_seconds=60))

    context = run()

    assert context["emergency_available"] is True
    # First call fails and is retried; the other query succeeds first time.
    assert attempts["primary"] == 3


def test_driving_street_query_skips_activity():
    query = es.build_street_query(ROUTE, include_activity=False)

    assert '"lit"' in query
    assert '"shop"' not in query
