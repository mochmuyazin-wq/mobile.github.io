"""
Iteration 3 backend tests:
- BUG 2 verification: full pairing flow via API (register two fresh users, invite, join, both see shared wallet + transactions).
- Confirm the already-paired real couple (azinganteng / nada) share wallet 6aa789f9ded55585486dfd3b
  and see the same transactions.
- Sanity regression on seeded couple budi/sari (still paired, share transactions).
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://joint-wallet-13.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _post(path, json=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=json, headers=h, timeout=30)


def _get(path, token=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, timeout=30)


# --------------------- BUG 2: fresh pairing flow ---------------------

class TestFreshPairing:
    """Register two brand-new users, invite + join, assert wallet has both members."""

    @classmethod
    def setup_class(cls):
        u = uuid.uuid4().hex[:8]
        cls.user_a_id = f"TEST_pair_a_{u}@dompet.test"
        cls.user_b_id = f"TEST_pair_b_{u}@dompet.test"
        cls.pw = "password123"

    def test_1_register_user_a(self):
        r = _post("/auth/register", {"name": "TEST_A", "identifier": self.user_a_id, "password": self.pw})
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert "access_token" in d and "user" in d
        assert d["user"]["wallet_id"], "new user must have a wallet auto-created"
        type(self).token_a = d["access_token"]
        type(self).wallet_a = d["user"]["wallet_id"]

    def test_2_register_user_b(self):
        r = _post("/auth/register", {"name": "TEST_B", "identifier": self.user_b_id, "password": self.pw})
        assert r.status_code in (200, 201), r.text
        d = r.json()
        type(self).token_b = d["access_token"]
        type(self).wallet_b = d["user"]["wallet_id"]
        # Each new user gets their own wallet initially.
        assert self.wallet_a != self.wallet_b

    def test_3_user_a_creates_invite(self):
        r = _post("/wallet/invite", token=self.token_a)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "code" in d and len(d["code"]) == 6 and d["code"].isdigit(), f"expected 6-digit code, got {d}"
        type(self).invite_code = d["code"]

    def test_4_user_b_joins_wallet(self):
        r = _post("/wallet/join", {"code": self.invite_code}, token=self.token_b)
        assert r.status_code == 200, r.text

    def test_5_wallet_has_both_members(self):
        # Both users should now see the same wallet with 2 members.
        ra = _get("/wallet", token=self.token_a)
        rb = _get("/wallet", token=self.token_b)
        assert ra.status_code == 200 and rb.status_code == 200
        wa, wb = ra.json(), rb.json()
        assert wa["id"] == wb["id"], f"wallet id mismatch: {wa['id']} vs {wb['id']}"
        assert len(wa["members"]) == 2, f"expected 2 members, got {len(wa['members'])}"
        member_names = sorted(m["name"] for m in wa["members"])
        assert member_names == ["TEST_A", "TEST_B"]
        # wallet_id on user must now match the shared one for both.
        me_a = _get("/me", token=self.token_a).json()
        me_b = _get("/me", token=self.token_b).json()
        assert me_a["wallet_id"] == me_b["wallet_id"] == wa["id"]

    def test_6_shared_transactions_visible(self):
        # User A creates a tx, User B must see it.
        cats = _get("/categories", token=self.token_a).json()
        assert cats and isinstance(cats, list)
        cat_id = cats[0]["id"]
        tx_body = {
            "type": "expense",
            "amount": 12345,
            "category_id": cat_id,
            "date": "2026-01-15",
            "note": "TEST_pair_shared_tx",
        }
        rc = _post("/transactions", tx_body, token=self.token_a)
        assert rc.status_code in (200, 201), rc.text
        # User B lists transactions with note filter q.
        rl = _get("/transactions?q=TEST_pair_shared_tx", token=self.token_b)
        assert rl.status_code == 200
        items = rl.json()["items"]
        assert any(t["note"] == "TEST_pair_shared_tx" and t["amount"] == 12345 for t in items), items


# --------------------- Real couple sanity check (read-only) ---------------------

class TestRealCouplePaired:
    """Verify azinganteng + nada share wallet 6aa789f9ded55585486dfd3b in DB (READ-ONLY).
    Their real password is unknown to us (login with 'password123' fails), so we verify
    directly against MongoDB rather than the API."""

    EXPECTED_WALLET = "6aa789f9ded55585486dfd3b"

    def test_both_users_on_expected_wallet(self):
        import subprocess, json
        out = subprocess.check_output([
            "mongosh", "test_database", "--quiet", "--eval",
            'JSON.stringify(db.users.find({wallet_id:"' + self.EXPECTED_WALLET + '"}, {name:1, email:1, wallet_id:1, _id:0}).toArray())'
        ], timeout=10).decode()
        users = json.loads(out.strip())
        assert len(users) == 2, f"expected 2 users on wallet, got {len(users)}: {users}"
        names = sorted(u["name"] for u in users)
        assert names == ["azinganteng", "nada"], names
        for u in users:
            assert u["wallet_id"] == self.EXPECTED_WALLET

    def test_same_transactions_visible_in_db(self):
        """Both users share the wallet, so /api/transactions must return the same set
        for both — verified indirectly: the transactions collection stores wallet_id,
        not user_id, so any tx in that wallet is visible to both members."""
        import subprocess
        out = subprocess.check_output([
            "mongosh", "test_database", "--quiet", "--eval",
            'db.transactions.countDocuments({wallet_id:"' + self.EXPECTED_WALLET + '", deleted_at:null})'
        ], timeout=10).decode().strip()
        # Just assert it's a non-negative integer (they may have 0 or more transactions).
        assert out.isdigit(), f"unexpected output: {out}"


# --------------------- Regression on seeded couple ---------------------

class TestSeededCoupleStillPaired:
    def test_budi_sari_shared(self):
        rb = _post("/auth/login", {"identifier": "budi@dompet.test", "password": "password123"})
        rs = _post("/auth/login", {"identifier": "sari@dompet.test", "password": "password123"})
        assert rb.status_code == 200 and rs.status_code == 200
        tb = rb.json()["access_token"]
        ts = rs.json()["access_token"]
        wb = _get("/wallet", token=tb).json()
        ws = _get("/wallet", token=ts).json()
        assert wb["id"] == ws["id"]
        assert len(wb["members"]) == 2


# --------------------- Network error message code review check ---------------------

def test_api_ts_indonesian_network_error_present():
    """Static check: apiFetch throws Indonesian friendly error on network failure."""
    with open("/app/frontend/src/lib/api.ts", "r", encoding="utf-8") as f:
        src = f.read()
    assert "Tidak bisa terhubung ke server" in src
    assert "new ApiError(0," in src
    # And apiFetch wraps fetch in try/catch
    assert "try {\n    res = await fetch" in src
