"""Конфигурация бота: токен из .env, пути к файлам, параметры проверки данных."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_env(path):
    """Читает .env (строки KEY=VALUE) в переменные окружения, без сторонних библиотек."""
    try:
        # utf-8-sig: Visual Studio и Блокнот могут сохранить файл с BOM-меткой в начале,
        # а с обычным utf-8 первый ключ превратился бы в "\ufeffBOT_TOKEN"
        with open(path, "r", encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if value and not os.environ.get(key):  # пустую переменную окружения перезаписываем
                    os.environ[key] = value
    except FileNotFoundError:
        pass  # .env нет - возможно, токен задан переменной окружения
    except (OSError, UnicodeDecodeError) as e:
        print(f"Не удалось прочитать {path}: {e}")


_load_env(BASE_DIR / ".env")

# --- Секреты и права -----------------------------------------------------
BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_IDS", "").replace(" ", "").split(",") if x.isdigit()}

# --- Пути ---------------------------------------------------------------
SESSION_DIR = BASE_DIR / "sessions"            # JSON-сессии по user_id
DATA_DIR = BASE_DIR / "data"
DB_FILE = DATA_DIR / "profiles_db.csv"         # общая база: сюда дописываются загруженные CSV
DAYS_FILE = DATA_DIR / "play_days.json"        # дни игры каждого игрока (для стрика)
LOG_FILE = BASE_DIR / "bot_flight.log"         # лог бота с timestamp
# CSV, который выгружает игра (папка lab2). Бот только читает его.
GAME_CSV = Path(os.getenv("GAME_CSV_PATH") or BASE_DIR.parent / "lab2" / "py_chameleon_clicker" / "clicker_profiles.csv")

SESSION_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

# --- Формат CSV и границы значений (согласованы с настройками игры по умолчанию) ---
CSV_FIELDS = ["Имя", "Уровень", "Очки", "Множитель", "Дата"]
DATE_FORMAT = "%Y-%m-%d %H:%M"
MAX_LEVEL = 10
MAX_MULTIPLIER = 5
MAX_NAME_LENGTH = 20
MAX_UPLOAD_BYTES = 1_000_000       # лимит размера загружаемого файла
MAX_UPLOAD_ROWS = 5000
TOP_LIMIT = 10                     # строк в таблице лидеров
WATCH_INTERVAL = 30                # секунд между проверками CSV игры (для /watch)


def require_token():
    """Останавливает запуск с понятным сообщением, если токен не задан."""
    if not BOT_TOKEN:
        env_path = BASE_DIR / ".env"
        state = "найден, но в нём нет строки BOT_TOKEN=..." if env_path.exists() else "НЕ НАЙДЕН"
        raise SystemExit(f"Не задан BOT_TOKEN. Файл {env_path} {state}")