import csv

import pytest

from binder.db import connect, migrate
from binder.repo import contacts, interactions, orgs
from scripts import import_from_sheet as imp

ROW = {"slug": "acme-tools", "name": "Acme Tools", "kind": "lead", "status": "in_conversation",
       "website": "acme.example", "sector": "Manufacturing", "size": "", "location": "Braga",
       "owner_email": "ana@example.com", "source": "A friend", "value_estimate": "", "tags": "rfq; warm",
       "summary": "Makes tools.", "next_step": "Send the deck", "next_step_due": "", "last_contact": "2026-11-10",
       "contacts": "Jo Test|Owner|jo@example.com|123|https://example.com/jo;Sam Test|Sales|||",
       "notes": "First call went well.", "sources": "a.md", "conflicts": "Size: 5 vs 50"}
CLIENT = dict(ROW, slug="beta-shop", name="Beta Shop", kind="client", status="active", contacts="", notes="",
              sources="", conflicts="", last_contact="")


@pytest.fixture
def conn(tmp_path):
    c = connect(str(tmp_path / "t.db"))
    migrate(c)
    return c


def test_parse_contacts_pads_and_skips_blanks():
    assert imp.parse_contacts("Jo|Owner|jo@x.com|1|https://l;;Sam||||") == [
        {"name": "Jo", "role": "Owner", "email": "jo@x.com", "phone": "1", "linkedin_url": "https://l"},
        {"name": "Sam"}]


def test_apply_creates_orgs_contacts_and_note(conn):
    assert imp.apply_rows(conn, [ROW, CLIENT], by="import@local") == {"organisations": 2, "contacts": 2, "notes": 1}
    o = orgs.get_by_slug(conn, "acme-tools")
    assert (o["kind"], o["status"], o["tags"], o["owner_email"], o["updated_by"]) == (
        "lead", "in_conversation", ["rfq", "warm"], "ana@example.com", "import@local")
    assert [c["name"] for c in contacts.list_for_org(conn, o["id"])] == ["Jo Test", "Sam Test"]
    note = interactions.list_for_org(conn, o["id"])[0]
    assert "Size: 5 vs 50" in note["summary"] and note["happened_at"].startswith("2026-11-10")
    b = orgs.get_by_slug(conn, "beta-shop")
    assert (b["kind"], b["status"]) == ("client", "active")


def test_second_apply_adds_nothing(conn):
    imp.apply_rows(conn, [ROW, CLIENT], by="import@local")
    assert imp.apply_rows(conn, [ROW, CLIENT], by="import@local") == {"organisations": 0, "contacts": 0, "notes": 0}
    assert len(orgs.list_(conn)) == 2
    assert len(interactions.list_for_org(conn, orgs.get_by_slug(conn, "acme-tools")["id"])) == 1


def test_reapply_keeps_a_correction_and_adds_a_new_contact(conn):
    imp.apply_rows(conn, [ROW], by="import@local")
    o = orgs.get_by_slug(conn, "acme-tools")
    orgs.update(conn, o["id"], {"status": "parked", "updated_at": o["updated_at"]}, "ana@example.com")
    out = imp.apply_rows(conn, [dict(ROW, contacts=ROW["contacts"] + ";Kim Test|CEO|||")], by="import@local")
    assert out == {"organisations": 0, "contacts": 1, "notes": 0}
    assert orgs.get_by_slug(conn, "acme-tools")["status"] == "parked"


@pytest.mark.parametrize("patch,msg", [
    ({"status": "bogus"}, "not a lead status"),
    ({"kind": "client", "status": "lead"}, "not a client status"),
    ({"owner_email": "nobody"}, "not an email"),
    ({"next_step_due": "soon"}, "YYYY-MM-DD"),
    ({"slug": ""}, "required"),
    ({"value_estimate": "lots"}, "number"),
])
def test_bad_rows_are_refused_before_anything_is_written(conn, patch, msg):
    with pytest.raises(imp.SheetError, match=msg):
        imp.apply_rows(conn, [CLIENT, dict(ROW, **patch)], by="import@local")
    assert orgs.list_(conn) == []


def test_duplicate_slug_is_refused(conn):
    with pytest.raises(imp.SheetError, match="twice"):
        imp.apply_rows(conn, [ROW, ROW], by="import@local")


def test_read_sheet_round_trip(tmp_path):
    p = tmp_path / "s.csv"
    with open(p, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(ROW))
        w.writeheader()
        w.writerow(ROW)
    assert imp.read_sheet(str(p)) == [ROW]


def test_sheet_sector_text_goes_to_description_and_a_key_stays_a_sector(conn):
    imp.apply_rows(conn, [ROW, dict(CLIENT, sector="retail_ecommerce")], by="import@local")
    a = orgs.get_by_slug(conn, "acme-tools")
    assert (a["sector"], a["description"]) == (None, "Manufacturing")
    b = orgs.get_by_slug(conn, "beta-shop")
    assert (b["sector"], b["description"]) == ("retail_ecommerce", None)
