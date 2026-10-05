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
    monkeypatch.setattr(weather, "_paused_until", 0.0)
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
    after_first = len(requests)
    search()

    assert after_first == 2          # one Kerala search + one India search
    assert len(requests) == after_first


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


# ============================ weather cells ============================

def test_cell_centres_cover_a_trips_area():
    cells = weather.cell_centres(10.30, 76.30, 10.37, 76.34)

    assert 1 < len(cells) <= 12
    lats = [lat for lat, _ in cells]
    lons = [lon for _, lon in cells]
    # The trip's own corners fall in cells that were fetched.
    keys = {weather._cache_key(lat, lon) for lat, lon in cells}
    for corner in ((10.30, 76.30), (10.37, 76.34), (10.335, 76.32)):
        assert weather._cache_key(*corner) in keys
    assert min(lats) <= 10.30 and max(lats) >= 10.37 and min(lons) <= 76.30 and max(lons) >= 76.34


def test_long_trips_do_not_fetch_a_grid():
    assert weather.cell_centres(8.5, 76.9, 12.9, 77.6) is None


def test_prefetch_never_raises(monkeypatch):
    serve(monkeypatch, weather, lambda r: httpx.Response(503))

    asyncio.run(weather.prefetch([(10.3, 76.3)]))


def test_a_failing_weather_service_is_skipped_for_a_while(monkeypatch):
    requests = serve(monkeypatch, weather, lambda r: httpx.Response(503))

    assert readings([(10.3, 76.3)]) == [None]
    assert readings([(10.9, 76.9)]) == [None]      # a different point, same outage

    # The second call did not wait for another failing request.
    assert len(requests) == 1


def test_weather_recovers_after_the_pause(monkeypatch):
    serve(monkeypatch, weather, lambda r: httpx.Response(503))
    readings([(10.3, 76.3)])

    monkeypatch.setattr(weather, "_paused_until", 0.0)
    serve(monkeypatch, weather, lambda r: httpx.Response(200, json=current(27)))

    assert readings([(10.3, 76.3)])[0]["temperature"] == 27


def test_slow_weather_is_given_up_on_quickly(monkeypatch):
    assert weather.WEATHER_TIMEOUT_S <= 5


# ============================ Kerala first, India only ============================

def photon_in(country, *features):
    body = photon(*features)
    for feature in body["features"]:
        feature["properties"]["countrycode"] = country
    return body


def test_kerala_results_come_before_other_indian_places(monkeypatch):
    def handler(request):
        bbox = request.url.params["bbox"]

        if bbox.startswith("74.8"):      # the Kerala-restricted search
            return httpx.Response(200, json=photon_in("IN", ("Kottayam, Kerala", 9.59, 76.52)))

        return httpx.Response(200, json=photon_in(
            "IN", ("Kottayam, Bihar", 25.0, 85.0), ("Kottayam, Kerala", 9.59, 76.52),
        ))

    serve(monkeypatch, geo, handler)

    names = [place["name"] for place in search("Kottayam")]

    assert names == ["Kottayam, Kerala", "Kottayam, Bihar"]


def test_the_search_is_limited_to_kerala_and_to_india(monkeypatch):
    requests = serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon()))

    search("Chalakudy")

    boxes = sorted(request.url.params["bbox"] for request in requests)

    assert boxes == ["68.0,6.5,97.5,35.7", "74.8,8.1,77.5,12.9"]


def test_places_outside_india_are_never_suggested(monkeypatch):
    serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon_in("LK", ("Colombo", 6.9, 79.8))))

    assert search("Colombo") == []


def test_it_is_biased_towards_kerala_unless_the_trip_is_elsewhere(monkeypatch):
    requests = serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon()))

    search("Kodakara")
    assert requests[0].url.params["lat"] == "10.5" and requests[0].url.params["lon"] == "76.4"

    requests.clear()
    geo._search_cache = geo.TTLCache(ttl_seconds=60)

    # The other end of the trip is in Kerala: bias towards it.
    search("Kodakara", 9.9, 76.3)
    assert requests[0].url.params["lat"] == "9.9"

    requests.clear()
    geo._search_cache = geo.TTLCache(ttl_seconds=60)

    # The other end is in Delhi: still search near Kerala's centre.
    search("Kodakara", 28.6, 77.2)
    assert requests[0].url.params["lat"] == "10.5"


def test_a_place_elsewhere_in_india_can_still_be_found(monkeypatch):
    def handler(request):
        if request.url.params["bbox"].startswith("74.8"):
            return httpx.Response(200, json=photon())

        return httpx.Response(200, json=photon_in("IN", ("Jaipur", 26.9, 75.8)))

    serve(monkeypatch, geo, handler)

    assert [place["name"] for place in search("Jaipur")] == ["Jaipur"]


def test_nominatim_fallback_makes_a_kerala_bounded_call_and_an_india_wide_call(monkeypatch):
    requests = serve(monkeypatch, geo, lambda r: httpx.Response(503) if "photon" in r.url.host else httpx.Response(200, json=[]))

    search()

    fallbacks = [request for request in requests if "nominatim" in request.url.host]

    assert len(fallbacks) == 2
    assert all(request.url.params["countrycodes"] == "in" for request in fallbacks)

    kerala_bounded = next(r for r in fallbacks if r.url.params["bounded"] == "1")
    india_wide = next(r for r in fallbacks if r.url.params["bounded"] == "0")

    # bounded=1 is a hard restriction, not just a preference: Kerala-first
    # on the Nominatim fallback must not depend on viewbox ranking alone.
    assert kerala_bounded.url.params["viewbox"] == "74.8,12.9,77.5,8.1"
    assert india_wide.url.params["viewbox"] == "68.0,35.7,97.5,6.5"


def test_both_photon_down_a_kerala_bounded_nominatim_result_still_comes_through(monkeypatch):
    """c) both Photon calls fail -> the Kerala-bounded Nominatim call rescues the result."""

    def handler(request):
        if "photon" in request.url.host:
            return httpx.Response(500)
        if request.url.params["bounded"] == "1":
            return httpx.Response(200, json=[
                {"osm_type": "node", "osm_id": 1, "lat": "10.22", "lon": "76.19",
                 "display_name": "Kodungallur, Thrissur, Kerala, India", "type": "town"},
            ])
        return httpx.Response(200, json=[])     # the India-wide leg has nothing extra to add

    serve(monkeypatch, geo, handler)

    assert [place["name"] for place in search("kod")] == ["Kodungallur"]


def test_a_failing_india_wide_nominatim_search_does_not_discard_a_good_kerala_one(monkeypatch):
    """d) Nominatim Kerala succeeds, Nominatim India fails on its own."""

    def handler(request):
        if "photon" in request.url.host:
            return httpx.Response(500)
        if request.url.params["bounded"] == "1":
            return httpx.Response(200, json=[
                {"osm_type": "node", "osm_id": 1, "lat": "10.22", "lon": "76.19",
                 "display_name": "Kodungallur, Thrissur, Kerala, India", "type": "town"},
            ])
        return httpx.Response(500)

    serve(monkeypatch, geo, handler)

    assert [place["name"] for place in search("kod")] == ["Kodungallur"]


def test_a_failing_kerala_bounded_nominatim_search_still_lets_india_wide_results_through(monkeypatch):
    """e) Nominatim India succeeds, Nominatim Kerala fails on its own."""

    def handler(request):
        if "photon" in request.url.host:
            return httpx.Response(500)
        if request.url.params["bounded"] == "1":
            return httpx.Response(500)
        return httpx.Response(200, json=[
            {"osm_type": "node", "osm_id": 2, "lat": "26.9", "lon": "75.8",
             "display_name": "Jaipur, Rajasthan, India", "type": "city"},
        ])

    serve(monkeypatch, geo, handler)

    assert [place["name"] for place in search("Jaipur")] == ["Jaipur"]


def test_kod_returns_kerala_results_when_photon_has_them(monkeypatch):
    """g) regression for the live bug: "kod" must surface Kerala matches."""

    def handler(request):
        if request.url.params["bbox"].startswith("74.8"):
            return httpx.Response(200, json=photon_in(
                "IN", ("Kodungallur", 10.22, 76.19), ("Kodakara", 10.37, 76.30), ("Kodanad", 10.18, 76.51),
            ))

        return httpx.Response(200, json=photon_in(
            "IN", ("Kod", 22.88, 75.18), ("Kod", 26.54, 74.35),
        ))

    serve(monkeypatch, geo, handler)

    names = [place["name"] for place in search("kod")]

    assert names[:3] == ["Kodungallur", "Kodakara", "Kodanad"]
    assert "Kod" in names


def test_chalakudy_returns_the_kerala_result(monkeypatch):
    """h) a real, named query returns its real Kerala match."""

    serve(monkeypatch, geo, lambda r: httpx.Response(200, json=photon(("Chalakudy", 10.3041, 76.3371))))

    place = search("chalakudy")[0]

    assert place["name"] == "Chalakudy"
    assert "Kerala" in place["description"]


def test_kerala_cannot_crowd_out_the_rest_of_india(monkeypatch):
    def handler(request):
        if request.url.params["bbox"].startswith("74.8"):
            return httpx.Response(200, json=photon_in("IN", *[(f"Kerala match {i}", 10 + i / 10, 76.3) for i in range(8)]))

        return httpx.Response(200, json=photon_in("IN", ("Delhi", 28.6, 77.2)))

    serve(monkeypatch, geo, handler)

    names = [place["name"] for place in search("Delhi")]

    assert len(names) == 6
    assert names[:5] == [f"Kerala match {i}" for i in range(5)]
    assert "Delhi" in names


def test_a_slow_or_failing_india_wide_search_does_not_discard_a_good_kerala_result(monkeypatch):
    """
    Regression: the India-wide bbox is a much bigger search than Kerala's
    own and can time out on its own (seen live for "kod"). asyncio.gather()
    used to propagate that one failure and throw away the Kerala search's
    already-successful results too, falling back to Nominatim - which has
    no hard Kerala restriction and returned zero Kerala matches.
    """

    def handler(request):
        if request.url.params["bbox"].startswith("74.8"):
            return httpx.Response(200, json=photon_in("IN", ("Kodungallur", 10.22, 76.19), ("Kodakara", 10.37, 76.30)))

        return httpx.Response(500)      # the India-wide search fails on its own

    serve(monkeypatch, geo, handler)

    assert [place["name"] for place in search("kod")] == ["Kodungallur", "Kodakara"]


def test_a_failing_kerala_search_still_lets_india_wide_results_through(monkeypatch):
    def handler(request):
        if request.url.params["bbox"].startswith("74.8"):
            return httpx.Response(500)      # the Kerala-restricted search fails on its own

        return httpx.Response(200, json=photon_in("IN", ("Jaipur", 26.9, 75.8)))

    serve(monkeypatch, geo, handler)

    assert [place["name"] for place in search("Jaipur")] == ["Jaipur"]
