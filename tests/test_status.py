import pytest
from ledger.errors import Invalid
from ledger.statuses import check_transition, initial_status


def test_initial_status():
    assert initial_status("lead") == "lead"
    assert initial_status("client") == "active"


def test_lead_moves_within_lead_statuses():
    assert check_transition("lead", "lead", "contacted") == ("lead", "contacted")


def test_won_turns_lead_into_active_client():
    assert check_transition("lead", "proposal_sent", "won") == ("client", "active")


def test_client_cannot_take_lead_status():
    with pytest.raises(Invalid):
        check_transition("client", "active", "contacted")


def test_unknown_status_rejected():
    with pytest.raises(Invalid):
        check_transition("lead", "lead", "maybe")


def test_lost_lead_can_reopen():
    assert check_transition("lead", "lost", "in_conversation") == ("lead", "in_conversation")


def test_status_change_writes_history(client, org):
    o = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "status": "contacted"}).json()
    o = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": o["updated_at"], "status": "won"}).json()
    assert o["kind"] == "client" and o["status"] == "active"
    hist = client.get("/api/orgs/%d/status-history" % org["id"]).json()
    assert [(h["from_status"], h["to_status"]) for h in hist] == [("contacted", "won"), ("lead", "contacted"), (None, "lead")]


def test_bad_status_is_422(client, org):
    r = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "status": "active"})
    assert r.status_code == 422
