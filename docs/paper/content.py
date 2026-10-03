# -*- coding: utf-8 -*-
"""
Content for the new LumaPath conference paper. Kept separate from the
layout/rendering code (build_paper.py) so the two can be reviewed
independently. Every factual claim here was verified against the
LumaPath repository or an actual run of it; see docs/PAPER_AUDIT.md for
how each one differs from the old paper.
"""

TITLE = (
    "LumaPath: A Safety-Aware Route Recommendation System with a "
    "Local Geospatial Database and a Rule-Based and AI/ML Safety Analysis"
)

AUTHORS = [
    ("Alan C V", "alan223011@sahrdaya.ac.in"),
    ("Alby Mano", "alby223911@sahrdaya.ac.in"),
    ("Abishek P S", "abishek223793@sahrdaya.ac.in"),
    ("Adhisankar M M", "adhisankar223709@sahrdaya.ac.in"),
    ("Geethu Wilson", "geethu@sahrdaya.ac.in"),
    ("Anly Antony M", "anlyantony@sahrdaya.ac.in"),
]
AFFILIATION = [
    "Dept. of Computer Science",
    "Sahrdaya College of Engineering and Technology",
]

ABSTRACT = (
    "Conventional navigation systems select routes by distance or travel "
    "time, leaving a traveller to judge safety separately. The original "
    "LumaPath prototype proposed closing that gap with an AI/ML safety "
    "stage, but its own evaluation section conceded that no trained model "
    "had actually been assessed. This paper reports the system LumaPath "
    "has become: a rule-based, explainable safety baseline, computed from "
    "a local OpenStreetMap-derived geospatial database with a real spatial "
    "index, drives route ranking and recommendation; a separate, "
    "genuinely-trained AI/ML model — a gradient-boosted regressor that "
    "learns to approximate the rule-based score from real route and "
    "weather features, plus an unsupervised model that flags routes with "
    "an unusual feature combination — is reported alongside it as "
    "additional, non-authoritative analysis. The paper documents the "
    "current routing, geospatial, safety-scoring, AI/ML and deployment "
    "architecture as implemented, reports measurements taken by actually "
    "running that implementation rather than assumed figures, and states "
    "plainly where an experiment is still future work rather than "
    "reporting a number that was not measured."
)

INDEX_TERMS = (
    "safety-aware navigation, route recommendation, decision support, "
    "OpenStreetMap, spatial database, rule-based scoring, surrogate "
    "model, anomaly detection, explainable AI"
)

# ==================================================
# TABLES
# ==================================================
# Each table: (number, title, col_headers, rows, notes_or_None)

TABLE_DATA_SOURCES = (
    "I",
    "CURRENT DATA SOURCES",
    ["Data", "Source", "Role"],
    [
        ["Road network, points of\ninterest, buildings",
         "OpenStreetMap extract\n(openstreetmap.fr, Kerala)",
         "Local SQLite + R-Tree database,\nbuilt offline; live Overpass only\noutside its coverage"],
        ["Route alternatives,\ngeometry, duration",
         "OSRM (FOSSGIS\nfoot/bike/car; project-\nosrm.org fallback)",
         "Direct + via-point candidate\nroutes, deduplicated"],
        ["Current weather",
         "Open-Meteo", "Precipitation, wind, temperature,\nvisibility, day/night per route"],
        ["Rule-based safety\nscore (training label)",
         "safety.py, computed on\nreal routes",
         "Supervised target for the AI/ML\nsurrogate model (Sec. III-F)"],
    ],
    None,
)

TABLE_FEATURES = (
    "II",
    "ROUTE-LEVEL FEATURES ACTUALLY AVAILABLE",
    ["Feature group", "Examples", "Used by"],
    [
        ["Route shape", "directness, turns per km",
         "Rule baseline, AI/ML model"],
        ["Road network", "major/local/ped-cycle road share,\nsidewalk share, mean speed limit,\npaved share, lit share, junctions\nand dead ends per km",
         "Rule baseline, AI/ML model"],
        ["Surroundings", "built-up share, longest stretch\nwithout mapped buildings",
         "Rule baseline, AI/ML model"],
        ["Emergency access", "median distance to hospitals/\nclinics and police stations",
         "Rule baseline, AI/ML model"],
        ["Street activity", "share of route near shops, food,\ntransit stops, banks",
         "Rule baseline only"],
        ["Weather", "precipitation, wind speed,\ntemperature, visibility, is-day",
         "Rule baseline, AI/ML model"],
    ],
    "Every feature above is a real, mapped or measured quantity; none is "
    "a crime or incident label (none exists for this project; see "
    "Section III-F).",
)

TABLE_STACK = (
    "III",
    "CURRENT IMPLEMENTATION STACK",
    ["Component", "Technology"],
    [
        ["Client", "React 19, Vite, Leaflet + MapLibre GL"],
        ["Backend", "FastAPI, Uvicorn, httpx (async)"],
        ["Routing", "OSRM (FOSSGIS foot/bike/car profiles)"],
        ["Geospatial store", "SQLite + R-Tree, built offline from an\nOpenStreetMap extract (not a database server)"],
        ["Geospatial fallback", "Overpass API, outside the local extract's\ncoverage only"],
        ["Weather", "Open-Meteo"],
        ["Rule-based safety", "safety.py (six weighted factors; this\npaper's “baseline,” not an external library)"],
        ["AI/ML analysis", "scikit-learn HistGradientBoostingRegressor\n+ IsolationForest (new; Section III-F)"],
        ["Deployment", "Docker (3-stage build), Render (free tier)"],
        ["Interface", "JSON over REST; NDJSON for streamed progress"],
    ],
    None,
)

TABLE_CASE_STUDY = (
    "IV",
    "A REAL ROUTE ANALYSIS NEAR KOCHI (WALKING)",
    ["Route", "Dist. (km)", "Time (min)", "Rule score", "Risk level"],
    [
        ["Route A", "3.45", "43.2", "86", "Lower risk"],
        ["Route B", "5.63", "70.4", "81", "Lower risk"],
        ["Route C", "2.83", "35.4", "88", "Lower risk"],
    ],
    "Produced by one live run of geo_context, weather_service, safety.py "
    "and ml/surrogate.py on real OpenStreetMap road geometry near Kochi, "
    "with live weather (28.2°C, 0.1 mm precipitation, 7-8 km/h wind, "
    "measured 2026-10-03). Route geometry came directly from the local "
    "database rather than from OSRM, which was rate-limiting this "
    "evaluation window (Section V); every other stage, including the "
    "AI/ML analysis, ran exactly as in production. ml_safety_model "
    "correctly reported status “not_trained” for all three, since "
    "the same rate limit prevented collecting a training set (Section V).",
)

TABLE_MODEL_CONFIG = (
    "V",
    "AI/ML MODEL CONFIGURATION",
    ["Property", "Value"],
    [
        ["Regressor", "HistGradientBoostingRegressor\n(scikit-learn), max_depth=4,\nlearning_rate=0.05, 200 iterations"],
        ["Anomaly detector", "IsolationForest, 200 trees,\ncontamination=0.1"],
        ["Features", "20: 15 real OSM/route-shape\nfeatures + 5 real weather features"],
        ["Target (regressor)", "safety.py's rule-based score for\nthe same real route (not a crime\nor incident label)"],
        ["Evaluation method", "Grouped k-fold by route midpoint\n(~2 km blocks), held-out areas"],
        ["Training routes (real)", "Not yet trained — see Section V"],
    ],
    "Configuration is real (ml/train_surrogate.py); training-run numbers "
    "are reported where they exist and marked otherwise, per Section V.",
)

TABLE_RESULTS = (
    "VI",
    "EXPERIMENTAL RESULTS (MEASURED)",
    ["Measurement", "Result"],
    [
        ["Local database", "495,875 roads; 151,361 places\n(142,881 activity, 5,270 hospital/\nclinic combined count, 852 police,\n181 fire, 2,170 clinic); 122 MB file"],
        ["Database build time", "132 s (build step); 211 s incl.\ndownloading the 178 MB extract"],
        ["Build peak memory", "~660 MB working set (measured\non this machine, Oct. 2026)"],
        ["R-Tree query: roads near\na route-shaped box", "567 ways in 47 ms"],
        ["R-Tree query: emergency\nservices near a box", "241 services in 22 ms"],
        ["R-Tree query: activity\nplaces near a box", "448 places in 2.5 ms"],
        ["Building-density query\n(180 samples)", "9.7 ms"],
        ["End-to-end analysis of\n3 real routes (geo + weather\n+ rule baseline + AI/ML)", "1,295 ms (excludes OSRM route\ngeneration; unavailable this\nsession, see Sec. V)"],
        ["Backend automated tests", "196 passed, 0 failed (11 new,\nfor ml/surrogate.py)"],
        ["Surrogate training code\ncheck (synthetic data)", "R²=0.947, MAE=2.35 on a known\nsynthetic relationship — confirms\nthe training/CV code is correct;\nNOT a real-world accuracy claim"],
        ["Real-world cross-validated\nR²/MAE on Kerala routes", "To be evaluated — see Section V"],
    ],
    "Every row was produced by actually running the code in this "
    "repository on 2026-10-03; none is assumed or carried over from the "
    "old paper.",
)

TABLE_COMPARISON = (
    "VII",
    "RULE-BASED BASELINE VS. AI/ML ANALYSIS",
    ["Aspect", "Rule-based baseline", "AI/ML analysis"],
    [
        ["Role in the system", "Drives ranking and the\nrecommendation (authoritative)",
         "Reported alongside the score;\nnever ranks or recommends"],
        ["What it represents", "Hand-specified weights over\nsix real-data factors",
         "A learned approximation of the\nbaseline's own output, plus an\nunsupervised outlier flag"],
        ["Training data", "None (rules are fixed)",
         "Real routes sampled across Kerala\nvia the production pipeline"],
        ["Adaptability", "Changed by editing weights",
         "Changed by retraining on new\nroutes, no code change"],
        ["Interpretability", "Direct: every factor and its\nweight is visible",
         "Indirect: feature importances and\nheld-out error, not a rule list"],
        ["Missing data", "Rescales remaining weights;\nreports lower confidence",
         "Uses the model's native\nmissing-value handling"],
    ],
    None,
)

TABLES = [
    TABLE_DATA_SOURCES, TABLE_FEATURES, TABLE_STACK, TABLE_CASE_STUDY,
    TABLE_MODEL_CONFIG, TABLE_RESULTS, TABLE_COMPARISON,
]

# ==================================================
# REFERENCES (unchanged from the old paper; see docs/PAPER_AUDIT.md Sec. 8
# for why no unverified new citations were added)
# ==================================================

REFERENCES = [
    "E. W. Dijkstra, “A note on two problems in connexion with graphs,” Numerische Mathematik, vol. 1, no. 1, pp. 269–271, 1959.",
    "H. Bast, D. Delling, A. Goldberg, M. Muller-Hannemann, T. Pajor, P. Sanders, D. Wagner, and R. F. Werneck, “Route planning in transportation networks,” in Algorithm Engineering, LNCS, vol. 9220, Springer, 2016, pp. 19–80.",
    "R. Kaur, V. Goyal, V. M. V. Gunturi, A. Saini, K. Sanadhya, R. Gupta, and S. Ratra, “A navigation system for safe routing,” in Proc. IEEE Int. Conf. Mobile Data Management, 2020, pp. 1–10.",
    "D. Bura, M. Singh, and P. Nandal, “Predicting secure and safe route for women using Google Maps,” in Proc. COMITCon, 2019, pp. 103–108.",
    "A. Eranpurwala, F. Indorewala, N. Mapari, and S. Mishra, “Women safety application for safe route prediction,” Int. Research J. Engineering and Technology, vol. 8, no. 5, pp. 2278–2282, 2021.",
    "E. Galbrun, K. Pelechrinis, and E. Terzi, “Urban navigation beyond shortest route: The case of safe paths,” Information Systems, vol. 57, pp. 160–171, 2016.",
    "S. Levy, W. Xiong, E. Belding, and W. Y. Wang, “SafeRoute: Learning to navigate streets safely in an urban environment,” ACM Trans. Intelligent Systems and Technology, vol. 11, no. 6, pp. 1–17, 2020.",
    "F. T. Islam, T. Hashem, and R. Shahriyar, “A privacy-enhanced and personalized safe route planner with crowdsourced data and computation,” in Proc. IEEE Int. Conf. Data Engineering, 2021, pp. 229–240.",
    "K. Fu, Y. Lu, and C. Lu, “TREADS: A safe route recommender using social media mining and text summarization,” in Proc. ACM SIGSPATIAL Int. Conf. Advances in Geographic Information Systems, 2014, pp. 557–560.",
    "H. Huang, Y. Wei, C. Han, J. Lee, S. Mao, and F. Gao, “Travel route safety estimation based on conflict simulation,” Accident Analysis and Prevention, vol. 171, 106666, 2022.",
    "T. Thilagavathi and A. Subashini, “Multi-factor risk assessment and route optimization for safe human travel,” Int. J. Advanced Computer Science and Applications, vol. 15, no. 11, pp. 426–435, 2024.",
    "I. Puthige, K. Bansal, C. Bindra, M. Kapur, D. Singh, V. K. Mishra, A. Aggarwal, J. Lee, B.-G. Kang, Y. Nam, and R. R. Mostafa, “Safest route detection via danger index calculation and K-means clustering,” Computers, Materials and Continua, vol. 69, no. 2, pp. 2761–2777, 2021.",
    "Y. S. Asawa, S. R. Gupta, V. Vaishnavi, and N. J. Jain, “User specific safe route recommendation system,” Int. J. Engineering Research and Technology, vol. 9, no. 10, pp. 574–580, 2020.",
    "E.-C. Toda-Puiulet and A.-I. Trifan, “Safest paths for women at night in Cluj-Napoca: A feature offered by UrbanPathfinders,” in Proc. ACM Celebration of Women in Computing, 2025.",
    "C. Zhou, M. Chen, J. Chen, Y. Chen, and W. Chen, “A multi-hazard risk assessment model for a road network based on neural networks and fuzzy comprehensive evaluation,” Sustainability, vol. 16, no. 6, 2429, 2024.",
    "S. Jiang, M. Jafari, M. Kharbeche, M. Jalayer, and K. N. Al-Khalifa, “Safe route mapping of roadways using multiple sourced data,” IEEE Trans. Intelligent Transportation Systems, vol. 23, no. 4, pp. 3169–3179, 2022.",
    "P. Litzinger, G. Navratil, A. Sivertun, and D. Meier, “Using weather information to improve route planning,” in Lecture Notes in Geoinformation and Cartography, Springer, 2012, pp. 199–214.",
    "D. Mukherjee and S. Mitra, “Pedestrian safety analysis of urban intersections in Kolkata, India using a combined proactive and reactive approach,” J. Transportation Safety and Security, vol. 14, no. 5, pp. 754–795, 2020.",
    "N. S. S. Al-Bdairi, S. L. Zubaidi, H. Zubaidi, and I. Obaid, “Injury severity of single-vehicle weather-related crashes on two-lane highways,” J. Transportation Safety and Security, pp. 1–21, 2023.",
    "K. Pawooskar and R. Kumar P., “Safest route detection application,” Int. Research J. Engineering and Technology, vol. 7, no. 5, pp. 5210–5214, 2020.",
    "A. V. Lakshmi and K. S. Joseph, “Travel safe: A systematic review on safe route guidance system,” in Proc. IEEE Conf. Interdisciplinary Approaches in Technology and Management for Social Innovation, 2022, pp. 1–6.",
    "M. S. Parvez and S. Moridpour, “Application of smart technologies in safety of vulnerable road users: A review,” Int. J. Transportation Science and Technology, 2024.",
    "M. Haklay and P. Weber, “OpenStreetMap: User-generated street maps,” IEEE Pervasive Computing, vol. 7, no. 4, pp. 12–18, 2008.",
    "R. Olbricht, “Overpass API: A database engine for OpenStreetMap data,” OpenStreetMap Foundation, Technical Documentation, 2024.",
    "D. Luxen and C. Vetter, “Real-time routing with OpenStreetMap data,” in Proc. ACM SIGSPATIAL Int. Conf. Advances in Geographic Information Systems, 2011, pp. 513–516.",
    "P. Zippenfenig, “Open-Meteo.com weather API,” Zenodo, 2023, doi: 10.5281/zenodo.7970649.",
    "V. Yashodha, S. Pagadala, C. S. Bhavani, S. Kamatchi, and J. M. Oli, “Rethinking urban navigation for safer journeys,” in Proc. Int. Conf. Emerging Technologies in Computing and Communication, IEEE, 2025.",
    "F. T. Liu, K. M. Ting, and Z.-H. Zhou, “Isolation forest,” in Proc. IEEE Int. Conf. Data Mining, 2008, pp. 413–422.",
]
