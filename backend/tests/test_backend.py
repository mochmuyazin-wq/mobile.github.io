"""Comprehensive backend test suite for DompetBerdua."""
import os
import time
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://joint-wallet-13.preview.emergentagent.com").rstrip("/")


# ---------------- Auth ----------------
class TestAuth:
    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/me")
        assert r.status_code == 401

    def test_login_email_case_insensitive(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"identifier": "BUDI@dompet.test", "password": "password123"})
        assert r.status_code == 200
        assert "access_token" in r.json() and r.json()["user"]["email"] == "budi@dompet.test"

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"identifier": "budi@dompet.test", "password": "wrong-pass"})
        assert r.status_code == 401

    def test_register_email(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@dompet.test"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "Test User", "identifier": email, "password": "password123"})
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["user"]["email"] == email.lower()
        assert data["user"]["wallet_id"]
        return data

    def test_register_phone(self):
        phone_raw = f"08{uuid.uuid4().int % 10**10:010d}"[:12]
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "Phone User", "identifier": phone_raw, "password": "password123"})
        assert r.status_code == 201, r.text
        user = r.json()["user"]
        assert user["phone"] and user["phone"].startswith("+62")

    def test_login_phone(self):
        # register then login with phone
        phone_raw = f"08{uuid.uuid4().int % 10**10:010d}"[:12]
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "PhoneLogin", "identifier": phone_raw, "password": "password123"})
        assert r.status_code == 201
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"identifier": phone_raw, "password": "password123"})
        assert r2.status_code == 200


# ---------------- Wallet & Pairing ----------------
class TestWalletPairing:
    def test_wallet_has_both_members(self, budi, sari):
        r = requests.get(f"{BASE_URL}/api/wallet", headers=budi["headers"])
        assert r.status_code == 200
        data = r.json()
        assert len(data["members"]) == 2
        emails = {m["email"] for m in data["members"] if m["email"]}
        assert {"budi@dompet.test", "sari@dompet.test"}.issubset(emails)

    def test_paired_wallet_cannot_create_invite(self, budi):
        r = requests.post(f"{BASE_URL}/api/wallet/invite", headers=budi["headers"])
        assert r.status_code == 400

    def test_invalid_invite_code_rejected(self, budi):
        r = requests.post(f"{BASE_URL}/api/wallet/join", headers=budi["headers"], json={"code": "000000"})
        assert r.status_code == 404

    def test_full_pairing_flow(self):
        # register two fresh users, A creates invite, B joins
        a_id = f"TEST_a{uuid.uuid4().hex[:6]}@d.test"
        b_id = f"TEST_b{uuid.uuid4().hex[:6]}@d.test"
        a = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "A", "identifier": a_id, "password": "password123"}).json()
        b = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "B", "identifier": b_id, "password": "password123"}).json()
        ha = {"Authorization": f"Bearer {a['access_token']}"}
        hb = {"Authorization": f"Bearer {b['access_token']}"}
        inv = requests.post(f"{BASE_URL}/api/wallet/invite", headers=ha)
        assert inv.status_code == 200
        code = inv.json()["code"]
        join = requests.post(f"{BASE_URL}/api/wallet/join", headers=hb, json={"code": code})
        assert join.status_code == 200, join.text
        # Both should share wallet
        wa = requests.get(f"{BASE_URL}/api/wallet", headers=ha).json()
        wb = requests.get(f"{BASE_URL}/api/wallet", headers=hb).json()
        assert wa["id"] == wb["id"]
        assert len(wa["members"]) == 2


# ---------------- Categories ----------------
class TestCategories:
    def test_default_categories_present(self, budi):
        r = requests.get(f"{BASE_URL}/api/categories", headers=budi["headers"])
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        assert {"Makan", "Transport", "Tagihan", "Hiburan", "Tabungan", "Belanja", "Kesehatan", "Lainnya"}.issubset(names)

    def test_create_and_duplicate_rejected(self, budi):
        name = f"TEST_cat_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/categories", headers=budi["headers"], json={"name": name, "icon": "star"})
        assert r.status_code == 201
        cat_id = r.json()["id"]
        # duplicate case-insensitive
        r2 = requests.post(f"{BASE_URL}/api/categories", headers=budi["headers"], json={"name": name.upper(), "icon": "star"})
        assert r2.status_code == 409
        # cleanup
        requests.delete(f"{BASE_URL}/api/categories/{cat_id}", headers=budi["headers"])


# ---------------- Transactions ----------------
class TestTransactions:
    def test_create_expense_income_and_partner_sees_it(self, budi, sari):
        cats = requests.get(f"{BASE_URL}/api/categories", headers=budi["headers"]).json()
        makan = next(c for c in cats if c["name"] == "Makan")
        today = date.today().isoformat()
        r = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
            "type": "expense", "amount": 15000, "category_id": makan["id"], "date": today, "note": "TEST_makan"
        })
        assert r.status_code == 201, r.text
        tx_id = r.json()["id"]
        assert r.json()["type"] == "expense" and r.json()["amount"] == 15000

        # income
        gaji = next((c for c in cats if c["name"] == "Tabungan"), makan)
        r2 = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
            "type": "income", "amount": 250000, "category_id": gaji["id"], "date": today, "note": "TEST_income"
        })
        assert r2.status_code == 201
        income_id = r2.json()["id"]

        # Partner sees it
        listing = requests.get(f"{BASE_URL}/api/transactions", headers=sari["headers"], params={"q": "TEST_makan"}).json()
        assert any(t["id"] == tx_id for t in listing["items"])

        # Filter owner=me for sari should NOT include budi's tx
        me_only = requests.get(f"{BASE_URL}/api/transactions", headers=sari["headers"], params={"owner": "me", "q": "TEST_makan"}).json()
        assert not any(t["id"] == tx_id for t in me_only["items"])
        partner_view = requests.get(f"{BASE_URL}/api/transactions", headers=sari["headers"], params={"owner": "partner", "q": "TEST_makan"}).json()
        assert any(t["id"] == tx_id for t in partner_view["items"])

        # Soft delete
        d = requests.delete(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"])
        assert d.status_code == 200
        after = requests.get(f"{BASE_URL}/api/transactions", headers=budi["headers"], params={"q": "TEST_makan"}).json()
        assert not any(t["id"] == tx_id for t in after["items"])
        # cleanup income
        requests.delete(f"{BASE_URL}/api/transactions/{income_id}", headers=budi["headers"])

    def test_notification_created_for_partner(self, budi, sari):
        cats = requests.get(f"{BASE_URL}/api/categories", headers=budi["headers"]).json()
        cat = cats[0]
        # mark sari's notifications read first for a clean baseline
        requests.post(f"{BASE_URL}/api/notifications/read-all", headers=sari["headers"])
        r = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
            "type": "expense", "amount": 5000, "category_id": cat["id"], "date": date.today().isoformat(), "note": "TEST_notify"
        })
        assert r.status_code == 201
        tx_id = r.json()["id"]
        time.sleep(0.5)
        notifs = requests.get(f"{BASE_URL}/api/notifications", headers=sari["headers"]).json()
        transaction_notifs = [n for n in notifs["items"] if n["type"] == "transaction" and not n["read"]]
        assert len(transaction_notifs) >= 1
        assert notifs["unread"] >= 1

        # read-all
        r2 = requests.post(f"{BASE_URL}/api/notifications/read-all", headers=sari["headers"])
        assert r2.status_code == 200
        after = requests.get(f"{BASE_URL}/api/notifications", headers=sari["headers"]).json()
        assert after["unread"] == 0
        requests.delete(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"])


# ---------------- Summary ----------------
class TestSummary:
    def test_summary_month(self, budi):
        r = requests.get(f"{BASE_URL}/api/summary", headers=budi["headers"], params={"period": "month"})
        assert r.status_code == 200
        data = r.json()
        for k in ("balance", "income", "expense", "by_category", "trend"):
            assert k in data
        assert isinstance(data["trend"], list) and len(data["trend"]) == 6

    def test_summary_period_variants(self, budi):
        for p in ("day", "week", "month"):
            r = requests.get(f"{BASE_URL}/api/summary", headers=budi["headers"], params={"period": p})
            assert r.status_code == 200

    def test_summary_owner_filter(self, budi):
        r = requests.get(f"{BASE_URL}/api/summary", headers=budi["headers"], params={"owner": "me"})
        assert r.status_code == 200


# ---------------- Budgets ----------------
class TestBudgets:
    def test_budget_upsert_and_warning_thresholds(self, budi, sari):
        cats = requests.get(f"{BASE_URL}/api/categories", headers=budi["headers"]).json()
        # use a unique category so we don't collide with existing spend
        cat_name = f"TEST_bdgt_{uuid.uuid4().hex[:6]}"
        cat_r = requests.post(f"{BASE_URL}/api/categories", headers=budi["headers"], json={"name": cat_name, "icon": "star"})
        cat_id = cat_r.json()["id"]
        month = date.today().isoformat()[:7]

        # Set budget of 10000
        up = requests.put(f"{BASE_URL}/api/budgets", headers=budi["headers"], json={"category_id": cat_id, "month": month, "limit_amount": 10000})
        assert up.status_code == 200

        listing = requests.get(f"{BASE_URL}/api/budgets", headers=budi["headers"], params={"month": month}).json()
        item = next(i for i in listing["items"] if i["category_id"] == cat_id)
        assert item["limit_amount"] == 10000 and item["status"] == "ok"

        # Baseline unread count for both
        requests.post(f"{BASE_URL}/api/notifications/read-all", headers=budi["headers"])
        requests.post(f"{BASE_URL}/api/notifications/read-all", headers=sari["headers"])

        # spend 8500 -> triggers 80% warning
        tx1 = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
            "type": "expense", "amount": 8500, "category_id": cat_id, "date": date.today().isoformat(), "note": "TEST_b80"
        })
        assert tx1.status_code == 201
        time.sleep(0.5)
        listing2 = requests.get(f"{BASE_URL}/api/budgets", headers=budi["headers"], params={"month": month}).json()
        item2 = next(i for i in listing2["items"] if i["category_id"] == cat_id)
        assert item2["status"] == "warning" and 0.8 <= item2["pct"] < 1
        n_budi = requests.get(f"{BASE_URL}/api/notifications", headers=budi["headers"]).json()
        n_sari = requests.get(f"{BASE_URL}/api/notifications", headers=sari["headers"]).json()
        assert any(n["type"] == "budget" and "hampir" in n["title"].lower() for n in n_budi["items"])
        assert any(n["type"] == "budget" for n in n_sari["items"])

        # spend more -> exceed
        tx2 = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
            "type": "expense", "amount": 4000, "category_id": cat_id, "date": date.today().isoformat(), "note": "TEST_b100"
        })
        assert tx2.status_code == 201
        listing3 = requests.get(f"{BASE_URL}/api/budgets", headers=budi["headers"], params={"month": month}).json()
        item3 = next(i for i in listing3["items"] if i["category_id"] == cat_id)
        assert item3["status"] == "exceeded" and item3["pct"] >= 1

        # cleanup: delete transactions and category
        requests.delete(f"{BASE_URL}/api/transactions/{tx1.json()['id']}", headers=budi["headers"])
        requests.delete(f"{BASE_URL}/api/transactions/{tx2.json()['id']}", headers=budi["headers"])
        # delete budget via limit=0
        requests.put(f"{BASE_URL}/api/budgets", headers=budi["headers"], json={"category_id": cat_id, "month": month, "limit_amount": 0})
        requests.delete(f"{BASE_URL}/api/categories/{cat_id}", headers=budi["headers"])


# ---------------- Upload ----------------
class TestUpload:
    def test_upload_and_download_receipt(self, budi):
        # tiny 1x1 png
        png = bytes.fromhex("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C63000100000005000101" "0DBABF3F0000000049454E44AE426082")
        r = requests.post(
            f"{BASE_URL}/api/upload",
            headers={"Authorization": budi["headers"]["Authorization"]},
            files={"file": ("test.png", png, "image/png")},
        )
        if r.status_code == 502:
            pytest.skip("Object storage unavailable in preview")
        assert r.status_code == 201, r.text
        path = r.json()["path"]

        # Auth via bearer header
        g = requests.get(f"{BASE_URL}/api/files/{path}", headers=budi["headers"])
        assert g.status_code in (200, 502), f"unexpected {g.status_code}: {g.text[:200]}"
        if g.status_code == 200:
            assert g.headers["content-type"].startswith("image/")
