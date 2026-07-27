import sqlite3
import os
from datetime import datetime
import zoneinfo

DB_PATH = os.environ.get("DB_PATH", "/data/drivlog.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # ドライバーマスタ (pin カラムを追加)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS drivers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        vehicle_number TEXT NOT NULL,
        pin TEXT NOT NULL DEFAULT '1234'
    )
    ''')
    
    # 既存DBへの互換性確保 (pinカラムが存在しない場合は追加)
    try:
        cursor.execute("SELECT pin FROM drivers LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE drivers ADD COLUMN pin TEXT NOT NULL DEFAULT '1234'")
    
    # タイムスタンプログ
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        note TEXT,
        FOREIGN KEY (driver_id) REFERENCES drivers (id)
    )
    ''')
    
    # デフォルトのドライバーマスタが空なら初期データを挿入
    cursor.execute("SELECT COUNT(*) FROM drivers")
    if cursor.fetchone()[0] == 0:
        initial_drivers = [
            ("山田 太郎", "多摩 100 あ 12-34", "1111"),
            ("鈴木 茂", "足立 100 い 56-78", "2222"),
            ("佐藤 次郎", "横浜 200 う 90-12", "3333")
        ]
        cursor.executemany("INSERT INTO drivers (name, vehicle_number, pin) VALUES (?, ?, ?)", initial_drivers)
        
    conn.commit()
    conn.close()

def add_log(driver_id: int, status: str, note: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    tokyo = zoneinfo.ZoneInfo("Asia/Tokyo")
    now_str = datetime.now(tokyo).isoformat()
    
    cursor.execute(
        "INSERT INTO logs (driver_id, status, timestamp, note) VALUES (?, ?, ?, ?)",
        (driver_id, status, now_str, note)
    )
    conn.commit()
    conn.close()
    return now_str
