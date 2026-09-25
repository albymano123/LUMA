import os
import sys

# Let tests import backend modules (main.py, safety.py, ...) directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
