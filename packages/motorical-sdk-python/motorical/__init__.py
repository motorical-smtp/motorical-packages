"""Official Python client for the Motorical APIs, generated from https://docs.motorical.com/openapi.json.

    from motorical import Motorical
    m = Motorical(api_key="mk_live_...")
    m.send_email(body={"from": "you@yourdomain.com", "to": "a@example.com", "subject": "Hi", "text": "Hello", "dryRun": True})
"""
from ._core import MotoricalError
from ._operations import OPENAPI_VERSION, OPERATIONS
from .client import Motorical

__all__ = ["Motorical", "MotoricalError", "OPENAPI_VERSION", "OPERATIONS"]
__version__ = "0.1.0"
