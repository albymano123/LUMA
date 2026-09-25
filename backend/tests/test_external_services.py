"""
Weather and geocoding with the network replaced by httpx's mock
transport: parsing, caching, and failing without inventing data.
"""

import asyncio

import httpx
import pytest

import geocoding_service as geo
import weather_service as weather


REAL_CLIENT = httpx.AsyncClient


def serve(monkeypatch, module, handler):
    """Make `module`'s httpx clients talk to `handler(request) -> httpx.Response`."""

    requests = []

    def factory(*args, **kwargs):
        def counting(request):
            requests.append(request)
            return handler(request)

        kwargs["transport"] = httpx.MockTransport(counting)
        return REAL_CLIENT(*args, **kwargs)

    monkeypatch.setattr(module.httpx, "AsyncClient", factory)

    return requests


# ============================ weather ============================

def current(temp=30, rain=0.0, is_day=1):
    return {"current": {
        "temperature_2m": temp, "apparent_temperature": temp + 3, "weather_code": 1,
        "precipitation": rain, "wind_speed_10m": 9, "visibility": 20000,
        "is_day": is_day, "time": "2026-09-25T10:00",
    }}


@pytest.fixture(autouse=True)
def fresh_caches(monkeypatch):
    monkeypatch.setattr(weather, "_weather_cache", weather.TTLCache(ttl_seconds=60))
    monkeypatch.setattr(geo, "_search_cache", geo.TTLCache(ttl_seconds=60))
    monkeypatch.setattr(geo, "_reverse_cache", geo.TTLCache(ttl_seconds=60))


def readings(points):
    return asyncio.run(weather.get_weather_for_points(points))


def test_several_points_are_fetched_in_one_request(monkeypatch):
    requests = serve(monkeypatch, weather, lambda r: httpx.Response(200, json=[current(30), current(28)]))

    result = readings([(10.3, 76.3), (10.4, 76.4)])

    assert len(requests) == 1
    assert [r["temperature"] for r in result] == [30, 28]
    assert result[0]["is_day"] is True


def test_single_point_response_is_an_object_not_a_list(monkeypatch):
    serve(monkeypatch, weather, lambda r: httpx.Response(200, json=current(31)))

    assert readings([(10.3, 76.3)])[0]["temperature"] == 31


def test_night_is_reported(monkeypatch):
    serve(monkeypatch, weather, lambda r: httpx.Response(200, json=current(is_day=0)))

    assert readings([(10.3, 76.3)])[0]["is_day"] is False


def test_outage_gives_none_never_perfect_weather(monkeypatch):
    serve(monkeypatch, weather, lambda r: httpx.Response(503))

    assert readings([(10.3, 76.3), (10.4, 76.4)]) == [None, None]


def test_bad_json_gives_none(monkeypatch):
    serve(monkeypatch, weather, lambda r: httpx.Response(200, text="<html>oops</html>"))

    assert readings([(10.3, 76.3)]) == [None]


def test_a_location_without_data_is_none_and_others_survive(monkeypatch):
    serve(monkeypatch, weather, lambda r: httpx.Response(200, json=[current(30), {"error": True}]))

    result = readings([(10.3, 76.3), (10.4, 76.4)])

    assert result[0]["temperature"] == 30
    assert result[1] is None


def test_results_are_cached_and_only_missing_points_are_requested(monkeypatch):
    requests = serve(monkeypatch, weather, lambda r: httpx.Response(200, json=[current(30)]))

    readings([(10.3, 76.3)])
    readings([(10.3, 76.3)])

    assert len(requests) == 1

    requests.clear()
    serve_again = serve(monkeypatch, weather, lambda r: httpx.Response(200, json=[current(25)]))
    result = readings([(10.3, 76.3), (11.0, 76.9)])

    assert len(serve_again) == 1
    assert "11.0000" in str(serve_again[0].url) and "10.3000" not in str(serve_again[0].url)
    assert result[0]["temperature"] == 30    # from cache
    assert result[1]["temperature"] == 25    # freshly fetched


# ============================ geocoding ============================

def photon(*features):
    return {"features": [
        {"geometry": {"coordinates": [lon, lat]},
         "properties": {"name": name, "city": "Chalakudy", "state": "Kerala",
                        "country": "India", "osm_type": "N", "osm_id": i, "osm_value": "town"}}
        for i, (name, lat, lon) in enumerate(features, start=1)
    ]}


def search(text="Chalakudy", lat=None, lon=None):
    return asyncio.run(geo.search_places(text, lat, lon))


def test_short_queries_do_not_hit_the_network(monkeypatch):
    requests = serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon()))

    assert search("ch") == []
    assert requests == []


def test_results_are_formatted_for_the_app(monkeypatch):
    serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon(("Chalakudy", 10.3041, 76.3371))))

    place = search()[0]

    assert place["name"] == "Chalakudy"
    assert place["lat"] == 10.3041 and place["lon"] == 76.3371
    assert "Kerala" in place["description"]


def test_duplicate_places_are_merged(monkeypatch):
    serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon(
        ("Chalakudy", 10.3, 76.3), ("Chalakudy", 10.3, 76.3), ("Chalakudi", 10.31, 76.32),
    )))

    assert [p["name"] for p in search()] == ["Chalakudy", "Chalakudi"]


def test_search_is_biased_towards_the_other_end_of_the_trip(monkeypatch):
    requests = serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon()))

    search("Kodakara", 10.3, 76.3)

    assert requests[0].url.params["lat"] == "10.3"


def test_nominatim_is_the_fallback_when_photon_fails(monkeypatch):
    def handler(request):
        if "photon" in request.url.host:
            return httpx.Response(500)
        return httpx.Response(200, json=[
            {"osm_type": "node", "osm_id": 9, "lat": "10.30", "lon": "76.33",
             "display_name": "Chalakudy, Thrissur, Kerala, India", "type": "town"}
        ])

    serve(monkeypatch, geo, handler)

    place = search()[0]

    assert place["name"] == "Chalakudy"
    assert place["lat"] == 10.30


def test_both_geocoders_down_gives_no_suggestions_not_fake_ones(monkeypatch):
    serve(monkeypatch, geo, lambda r: httpx.Response(503))

    assert search() == []


def test_repeated_searches_are_cached(monkeypatch):
    requests = serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon(("Chalakudy", 10.3, 76.3))))

    search()
    search()

    assert len(requests) == 1


def test_reverse_geocode_falls_back_to_a_plain_point_never_a_fake_address(monkeypatch):
    serve(monkeypatch, geo, lambda r: httpx.Response(500))

    place = asyncio.run(geo.reverse_geocode(10.3, 76.33))

    assert place["name"] == "Selected location"
    assert (place["lat"], place["lon"]) == (10.3, 76.33)


def test_reverse_geocode_keeps_the_exact_coordinates(monkeypatch):
    serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon(("Some Road", 10.3001, 76.3302))))

    place = asyncio.run(geo.reverse_geocode(10.3, 76.33))

    assert place["name"] == "Some Road"
    assert (place["lat"], place["lon"]) == (10.3, 76.33)
