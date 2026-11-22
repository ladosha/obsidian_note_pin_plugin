"""Write the demo vault the community-page screenshots are taken in.

    python make_vault.py "<folder>/My vault"

Creates the notes (dates relative to today), installs the plugin from ../../ (main.js, manifest.json,
styles.css) and turns it on. The folder's name is the vault name Obsidian shows.
"""
import json
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path

PLUGIN = Path(__file__).resolve().parent.parent.parent
vault = Path(sys.argv[1])
today = date.today()


def day(offset: int) -> str:
    return (today + timedelta(days=offset)).isoformat()


def weekday_ahead(weekday: int) -> date:
    """The next date (today counts) with that weekday, Monday = 0."""
    return today + timedelta(days=(weekday - today.weekday()) % 7)


NOTES = {
    "Home/Call the dentist.md": (
        {"color": "red", "reminder": f"{day(1)}T10:00", "reminder-type": "time",
         "notification-subtitle": "Ask about the Thursday slot"},
        "Ask about the Thursday slot. Bring the insurance card.\n\n## Questions\n\n- [ ] Is the cleaning covered?\n"
        "- [ ] When is the next check-up?\n- [x] Find last year's X-rays\n\n## Address\n\nDr. Silva, Rua Augusta 12\n"),
    "Home/Groceries.md": (
        {"color": "green", "reminder": day(0), "reminder-type": "statusbar"},
        "- [ ] Milk\n- [ ] Eggs\n- [ ] Coffee beans\n- [ ] Basil\n- [x] Bread\n"),
    "Home/Water the plants.md": (
        {"color": "green", "reminder": f"{day(0)}T19:00", "reminder-type": "time", "reminder-repeat": "daily"},
        "Ferns every day, cactus on Sundays.\n"),
    "Home/Recipes.md": ({}, "Pastéis de nata, shakshuka, lentil soup.\n"),
    "People/Anna's birthday.md": (
        {"color": "yellow", "reminder": day(18), "reminder-type": "allday", "reminder-repeat": "yearly"},
        "Book the table at Casa Lina. She liked the blue scarf.\n"),
    "People/Grandma's birthday.md": (
        {"color": "#e86fb0", "reminder": day(41), "reminder-type": "allday", "reminder-repeat": "yearly-lunar"},
        "Call in the morning. Mooncakes from the bakery on Pine Street.\n"),
    "People/Contacts.md": ({}, "Dr. Silva: +351 21 000 0000\n"),
    "Travel/Packing list - Lisbon.md": (
        {"color": "orange", "pinned": True, "reminder": day(0), "reminder-type": "statusbar"},
        "- [x] Passport\n- [x] Charger\n- [ ] Sunglasses\n- [ ] Sandals\n- [ ] A good book\n- [ ] Travel adapter\n"),
    "Travel/Lisbon itinerary.md": ({}, "Day 1: Alfama, Day 2: Belém, Day 3: Sintra.\n"),
    "Work/Today's focus.md": (
        {"color": "purple", "pinned": True, "reminder": day(0), "reminder-type": "statusbar"},
        "Finish the quarterly report draft.\n"),
    "Work/Weekly review.md": (
        {"color": "blue", "reminder": f"{weekday_ahead(4).isoformat()}T17:00", "reminder-type": "time",
         "reminder-repeat": "weekly"},
        "What went well, what didn't, and the three priorities for next week.\n"),
    "Work/Team retro.md": (
        {"color": "blue", "reminder": f"{day(9)}T15:00", "reminder-type": "time",
         "reminder-repeat": "monthly-weekday", "reminder-until": f"{today.year + 1}-06-30"},
        "Start, stop, continue.\n"),
    "Work/Project ideas.md": ({"color": "purple", "pinned": True}, "A habit tracker that lives in daily notes.\n"),
    "Work/Meeting notes.md": ({}, "Q4 planning: budget, hiring, roadmap.\n"),
    "Reading list.md": ({"color": "yellow", "pinned": True}, "- Piranesi\n- The Overstory\n- Klara and the Sun\n"),
}


def frontmatter(props: dict) -> str:
    if not props:
        return ""
    lines = []
    for key, value in props.items():
        if isinstance(value, bool):
            lines.append(f"{key}: {'true' if value else 'false'}")
        else:
            lines.append(f'{key}: "{value}"')
    return "---\n" + "\n".join(lines) + "\n---\n"


if vault.exists():
    shutil.rmtree(vault)
for path, (props, body) in NOTES.items():
    file = vault / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(frontmatter(props) + body, encoding="utf-8")

config = vault / ".obsidian"
target = config / "plugins" / "vladmas-note-pin"
target.mkdir(parents=True)
for name in ("main.js", "manifest.json", "styles.css"):
    shutil.copy(PLUGIN / name, target / name)
(config / "community-plugins.json").write_text(json.dumps(["vladmas-note-pin"]), encoding="utf-8")
(config / "appearance.json").write_text(json.dumps({"theme": "obsidian"}), encoding="utf-8")
(config / "app.json").write_text(json.dumps({"showInlineTitle": True, "propertiesInDocument": "hidden"}), encoding="utf-8")
print("wrote", vault)
