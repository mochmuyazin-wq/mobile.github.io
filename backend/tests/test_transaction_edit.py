"""PATCH /api/transactions/{id} tests for the new Edit Transaksi feature."""
import os
import time
import uuid
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://joint-wallet-13.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def context(budi, sari):
    """Create a fresh TEST_ category + a base transaction we can edit through the module."""
    cats = requests.get(f"{BASE_URL}/api/categories", headers=budi["headers"]).json()
    cat_a = next(c for c in cats if c["name"] == "Makan")
    cat_b = next(c for c in cats if c["name"] == "Transport")
    today = date.today().isoformat()
    r = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
        "type": "expense", "amount": 10000, "category_id": cat_a["id"], "date": today, "note": "TEST_edit_seed"
    })
    assert r.status_code == 201, r.text
    tx = r.json()
    yield {"tx_id": tx["id"], "cat_a": cat_a, "cat_b": cat_b, "today": today}
    # cleanup
    requests.delete(f"{BASE_URL}/api/transactions/{tx['id']}", headers=budi["headers"])


class TestPatchTransactionSuccess:
    def test_patch_amount_only(self, budi, context):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"amount": 25000},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["amount"] == 25000
        # Verify persistence
        lst = requests.get(f"{BASE_URL}/api/transactions", headers=budi["headers"], params={"q": "TEST_edit_seed"}).json()
        found = next(t for t in lst["items"] if t["id"] == context["tx_id"])
        assert found["amount"] == 25000
        assert found["category_name"] == context["cat_a"]["name"]  # unchanged
        assert found["note"] == "TEST_edit_seed"  # unchanged

    def test_patch_note_only(self, budi, context):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"note": "TEST_edit_seed updated"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["note"] == "TEST_edit_seed updated"

    def test_patch_category_only(self, budi, context):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"category_id": context["cat_b"]["id"]},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["category_id"] == context["cat_b"]["id"]
        assert data["category_name"] == context["cat_b"]["name"]

    def test_patch_combined(self, budi, context):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"amount": 33333, "category_id": context["cat_a"]["id"], "note": "TEST_combined"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["amount"] == 33333
        assert d["category_id"] == context["cat_a"]["id"]
        assert d["note"] == "TEST_combined"

    def test_partner_sees_edit(self, budi, sari, context):
        # Set to a known distinctive amount then assert visibility for the paired user
        target_amount = 77777
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"amount": target_amount, "note": "TEST_partner_view"},
        )
        assert r.status_code == 200
        lst = requests.get(f"{BASE_URL}/api/transactions", headers=sari["headers"], params={"q": "TEST_partner_view"}).json()
        found = next(t for t in lst["items"] if t["id"] == context["tx_id"])
        assert found["amount"] == target_amount
        assert found["note"] == "TEST_partner_view"


class TestPatchValidation:
    def test_no_auth_returns_401(self, context):
        r = requests.patch(f"{BASE_URL}/api/transactions/{context['tx_id']}", json={"amount": 1000})
        assert r.status_code == 401

    def test_amount_zero_returns_422(self, budi, context):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"amount": 0},
        )
        assert r.status_code == 422, r.text

    def test_unknown_category_returns_422(self, budi, context):
        fake_id = "507f1f77bcf86cd799439011"  # valid ObjectId shape but not in wallet
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"category_id": fake_id},
        )
        assert r.status_code == 422, r.text

    def test_malformed_category_returns_422(self, budi, context):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"category_id": "not-an-objectid"},
        )
        assert r.status_code == 422

    def test_malformed_date_returns_422(self, budi, context):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{context['tx_id']}",
            headers=budi["headers"],
            json={"date": "31-01-2026"},
        )
        assert r.status_code == 422

    def test_unknown_tx_returns_404(self, budi):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/507f1f77bcf86cd799439099",
            headers=budi["headers"],
            json={"amount": 1000},
        )
        assert r.status_code == 404

    def test_malformed_tx_id_returns_404(self, budi):
        r = requests.patch(
            f"{BASE_URL}/api/transactions/not-an-id",
            headers=budi["headers"],
            json={"amount": 1000},
        )
        assert r.status_code == 404

    def test_deleted_tx_returns_404(self, budi):
        cats = requests.get(f"{BASE_URL}/api/categories", headers=budi["headers"]).json()
        cat = cats[0]
        c = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
            "type": "expense", "amount": 1000, "category_id": cat["id"], "date": date.today().isoformat(), "note": "TEST_del"
        })
        tx_id = c.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"])
        assert d.status_code == 200
        r = requests.patch(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"], json={"amount": 2000})
        assert r.status_code == 404


class TestPatchBudgetInteraction:
    """Editing amount UP across 80%/100% thresholds -> notifications; DOWN -> reset to ok."""

    def test_edit_up_and_down_moves_budget_status(self, budi, sari):
        # unique category so we control spend precisely
        cat_name = f"TEST_edit_bdgt_{uuid.uuid4().hex[:6]}"
        cat_r = requests.post(f"{BASE_URL}/api/categories", headers=budi["headers"], json={"name": cat_name, "icon": "star"})
        assert cat_r.status_code == 201
        cat_id = cat_r.json()["id"]
        month = date.today().isoformat()[:7]

        # budget = 10000
        up = requests.put(f"{BASE_URL}/api/budgets", headers=budi["headers"], json={
            "category_id": cat_id, "month": month, "limit_amount": 10000
        })
        assert up.status_code == 200

        # baseline notifications
        requests.post(f"{BASE_URL}/api/notifications/read-all", headers=budi["headers"])
        requests.post(f"{BASE_URL}/api/notifications/read-all", headers=sari["headers"])

        # Seed at low 1000 -> status ok
        tx = requests.post(f"{BASE_URL}/api/transactions", headers=budi["headers"], json={
            "type": "expense", "amount": 1000, "category_id": cat_id, "date": date.today().isoformat(), "note": "TEST_edit_bdgt"
        }).json()
        tx_id = tx["id"]
        bdg = requests.get(f"{BASE_URL}/api/budgets", headers=budi["headers"], params={"month": month}).json()
        item = next(i for i in bdg["items"] if i["category_id"] == cat_id)
        assert item["status"] == "ok"

        # Edit UP -> 8500 crosses 80%
        r = requests.patch(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"], json={"amount": 8500})
        assert r.status_code == 200
        time.sleep(0.5)
        bdg = requests.get(f"{BASE_URL}/api/budgets", headers=budi["headers"], params={"month": month}).json()
        item = next(i for i in bdg["items"] if i["category_id"] == cat_id)
        assert item["status"] == "warning", item

        n_budi = requests.get(f"{BASE_URL}/api/notifications", headers=budi["headers"]).json()
        n_sari = requests.get(f"{BASE_URL}/api/notifications", headers=sari["headers"]).json()
        assert any(n["type"] == "budget" for n in n_budi["items"]), "budi should get 80% budget notif"
        assert any(n["type"] == "budget" for n in n_sari["items"]), "sari (partner) should get 80% budget notif"

        # Edit UP further -> 12000 exceeds 100%
        r = requests.patch(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"], json={"amount": 12000})
        assert r.status_code == 200
        time.sleep(0.5)
        bdg = requests.get(f"{BASE_URL}/api/budgets", headers=budi["headers"], params={"month": month}).json()
        item = next(i for i in bdg["items"] if i["category_id"] == cat_id)
        assert item["status"] == "exceeded", item

        # Edit DOWN -> 500 back to ok
        r = requests.patch(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"], json={"amount": 500})
        assert r.status_code == 200
        time.sleep(0.5)
        bdg = requests.get(f"{BASE_URL}/api/budgets", headers=budi["headers"], params={"month": month}).json()
        item = next(i for i in bdg["items"] if i["category_id"] == cat_id)
        assert item["status"] == "ok", item

        # cleanup
        requests.delete(f"{BASE_URL}/api/transactions/{tx_id}", headers=budi["headers"])
        requests.put(f"{BASE_URL}/api/budgets", headers=budi["headers"], json={
            "category_id": cat_id, "month": month, "limit_amount": 0
        })
        requests.delete(f"{BASE_URL}/api/categories/{cat_id}", headers=budi["headers"])
