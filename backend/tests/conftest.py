import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://joint-wallet-13.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, identifier, password):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]


@pytest.fixture(scope="session")
def budi(api):
    token, user = _login(api, "budi@dompet.test", "password123")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def sari(api):
    token, user = _login(api, "sari@dompet.test", "password123")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}
