"""Тесты аналитики и сессий (без Telegram). Запуск: python -m unittest test_analytics -v"""
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import analytics
import config
import session

GOOD = ("Имя,Уровень,Очки,Множитель,Дата\n"
        "Мира,4,1340,5,2026-10-28 01:19\n"
        "гг,3,510,4,2026-10-27 20:00\n"
        "керос,3,280,3,2026-10-26 18:30\n")


class BaseCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        config.SESSION_DIR = root / "sessions"
        config.SESSION_DIR.mkdir()
        config.DB_FILE = root / "db.csv"
        config.DAYS_FILE = root / "days.json"
        config.GAME_CSV = root / "game.csv"

    def tearDown(self):
        self.tmp.cleanup()


class ParseTests(BaseCase):
    def test_good_file(self):
        records, errors = analytics.parse_profiles_text(GOOD)
        self.assertEqual(len(records), 3)
        self.assertEqual(errors, [])

    def test_bad_rows_do_not_break_parsing(self):
        text = GOOD + "Петя,abc,1,1,2026-10-28 01:00\nКоля,2,5\nЛёша,99,10,1,2026-10-28 01:00\n"
        records, errors = analytics.parse_profiles_text(text)
        self.assertEqual(len(records), 3)
        self.assertEqual(len(errors), 3)

    def test_wrong_header_and_empty(self):
        self.assertEqual(analytics.parse_profiles_text("a,b\n1,2\n")[0], [])
        self.assertEqual(analytics.parse_profiles_text("")[1], ["файл пустой"])

    def test_verification_rules(self):
        R = analytics.Record
        self.assertEqual(analytics.verify_record(R("Ок", 4, 1340, 5, "2026-10-28 01:19")), [])
        self.assertTrue(analytics.verify_record(R("", 1, 0, 1, "2026-10-28 01:19")))
        self.assertTrue(analytics.verify_record(R("A", 3, 10, 1, "2026-10-28 01:19")))      # мало очков
        self.assertTrue(analytics.verify_record(R("A", 1, 99999, 1, "2026-10-28 01:19")))   # много очков
        self.assertTrue(analytics.verify_record(R("A", 1, 10, 9, "2026-10-28 01:19")))      # множитель
        self.assertTrue(analytics.verify_record(R("A", 1, 10, 1, "вчера")))                 # дата
        self.assertTrue(analytics.verify_record(R("A", 1, 10, 1, "2099-01-01 00:00")))      # будущее


class DataTests(BaseCase):
    def test_append_and_merge(self):
        records, _ = analytics.parse_profiles_text(GOOD)
        added, updated, changed = analytics.append_records(records)
        self.assertEqual((added, updated), (3, 0))
        # повтор того же файла ничего не меняет
        self.assertEqual(analytics.append_records(records)[:2], (0, 0))
        # более свежий результат обновляет игрока, регистр имени не важен
        newer = [analytics.Record("мира", 5, 2000, 5, "2026-10-28 10:00")]
        self.assertEqual(analytics.append_records(newer)[:2], (0, 1))
        top = analytics.leaderboard(analytics.load_all())
        self.assertEqual((top[0].name, top[0].score), ("мира", 2000))
        # более старый результат игнорируется
        older = [analytics.Record("мира", 4, 1340, 5, "2026-10-01 10:00")]
        self.assertEqual(analytics.append_records(older)[:2], (0, 0))

    def test_game_file_and_db_are_merged(self):
        config.GAME_CSV.write_text(GOOD, encoding="utf-8-sig")
        analytics.append_records([analytics.Record("Новый", 2, 100, 2, "2026-10-28 12:00")])
        self.assertEqual(len(analytics.load_all()), 4)

    def test_missing_or_broken_files(self):
        self.assertEqual(analytics.load_all(), [])
        config.GAME_CSV.write_bytes(b"\xff\xfe\x00broken")
        self.assertEqual(analytics.load_all(), [])

    def test_leaderboard_and_format(self):
        records, _ = analytics.parse_profiles_text(GOOD)
        self.assertEqual([r.name for r in analytics.leaderboard(records)], ["Мира", "гг", "керос"])
        evil = [analytics.Record("<b>x&", 1, 0, 1, "2026-10-28 01:19")]
        self.assertNotIn("<b>x", analytics.format_leaderboard(evil))  # имя экранировано
        self.assertEqual(analytics.rank_of(records, "ГГ"), 2)

    def test_streak(self):
        recs = [analytics.Record("Мира", 1, 0, 1, f"2026-10-{d} 10:00") for d in (25, 27, 28, 29)]
        analytics.sync_days(recs)
        self.assertEqual(analytics.streak_days("мира", today=date(2026, 10, 29)), (3, True))
        self.assertEqual(analytics.streak_days("мира", today=date(2026, 11, 20)), (3, False))
        self.assertEqual(analytics.streak_days("нет"), (0, False))

    def test_achievements_and_texts(self):
        records, _ = analytics.parse_profiles_text(GOOD)
        analytics.sync_days(records)
        r = analytics.find_player(records, "мира")
        got = {a.code for a in analytics.achievements(r, 0) if a.unlocked}
        self.assertEqual(got, {"first", "eye", "combo", "thousand"})
        self.assertIn("Место в рейтинге: 1 из 3", analytics.format_stats(records, "Мира"))
        self.assertIsNone(analytics.format_stats(records, "Неизвестный"))
        self.assertIn("Ачивки", analytics.format_achievements(records, "Мира"))

    def test_diff_for_notifications(self):
        old = {r.key: r for r in analytics.parse_profiles_text(GOOD)[0]}
        new = [analytics.Record("Мира", 5, 2000, 5, "2026-10-29 10:00"),
               analytics.Record("Нов", 1, 10, 1, "2026-10-29 10:00")]
        self.assertEqual({r.name for r in analytics.diff_records(old, new)}, {"Мира", "Нов"})


class SessionTests(BaseCase):
    def test_new_session_and_isolation(self):
        self.assertEqual(session.load_session(1)["state"], "MENU")
        s = session.load_session(1); s["name"] = "A"; session.save_session(1, s)
        s2 = session.load_session(2); s2["name"] = "B"; session.save_session(2, s2)
        self.assertEqual(session.load_session(1)["name"], "A")
        self.assertEqual(session.load_session(2)["name"], "B")
        self.assertEqual({uid for uid, _ in session.all_sessions()}, {1, 2})

    def test_broken_session_file(self):
        (config.SESSION_DIR / "5.json").write_text("{bad", encoding="utf-8")
        self.assertIsNone(session.load_session(5)["name"])
        (config.SESSION_DIR / "6.json").write_text("[1,2]", encoding="utf-8")
        self.assertEqual(session.load_session(6)["state"], "MENU")

    def test_session_is_valid_json(self):
        session.save_session(7, {**session.create_new_session(7), "name": "Мира"})
        data = json.loads((config.SESSION_DIR / "7.json").read_text(encoding="utf-8"))
        self.assertEqual(data["name"], "Мира")


if __name__ == "__main__":
    unittest.main()
