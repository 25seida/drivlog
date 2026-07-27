from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import io
import csv
from datetime import datetime
import zoneinfo
import sqlite3

from database import init_db, get_db_connection, add_log

app = FastAPI(title="DrivLog API")

# DBの初期化
init_db()

class DriverCreate(BaseModel):
    name: str
    vehicle_number: str
    pin: str

class LogCreate(BaseModel):
    driver_id: int
    status: str
    note: Optional[str] = None

class AuthRequest(BaseModel):
    driver_id: int
    pin: str

@app.get("/api/drivers")
def get_drivers():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, vehicle_number FROM drivers")
    drivers = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return drivers

@app.post("/api/drivers")
def create_driver(driver: DriverCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO drivers (name, vehicle_number, pin) VALUES (?, ?, ?)",
            (driver.name, driver.vehicle_number, driver.pin)
        )
        conn.commit()
        driver_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Driver name already exists")
    conn.close()
    return {"id": driver_id, "name": driver.name, "vehicle_number": driver.vehicle_number}

@app.post("/api/drivers/auth")
def auth_driver(auth: AuthRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM drivers WHERE id = ? AND pin = ?", (auth.driver_id, auth.pin))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="暗証番号が正しくありません")
    return {"status": "success", "message": "認証に成功しました"}

@app.post("/api/logs")
def create_log(log: LogCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM drivers WHERE id = ?", (log.driver_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Driver not found")
    conn.close()
    
    timestamp = add_log(log.driver_id, log.status, log.note)
    return {"status": "success", "timestamp": timestamp}

@app.get("/api/logs/today")
def get_today_logs():
    tokyo = zoneinfo.ZoneInfo("Asia/Tokyo")
    today_str = datetime.now(tokyo).date().isoformat()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM drivers")
    drivers = [dict(row) for row in cursor.fetchall()]
    
    results = []
    for d in drivers:
        cursor.execute(
            "SELECT * FROM logs WHERE driver_id = ? AND timestamp >= ? ORDER BY timestamp ASC",
            (d["id"], today_str)
        )
        logs = [dict(row) for row in cursor.fetchall()]
        
        if logs:
            current_status = logs[-1]["status"]
            last_action_time = logs[-1]["timestamp"]
        else:
            cursor.execute(
                "SELECT * FROM logs WHERE driver_id = ? ORDER BY timestamp DESC LIMIT 1",
                (d["id"],)
            )
            last_log = cursor.fetchone()
            current_status = last_log["status"] if last_log else "OFFLINE"
            last_action_time = last_log["timestamp"] if last_log else None
            
        total_wait_minutes = 0
        wait_start = None
        
        for l in logs:
            l_time = datetime.fromisoformat(l["timestamp"])
            if l["status"] == "WAITING":
                wait_start = l_time
            elif wait_start is not None and l["status"] in ("WORKING", "DRIVING", "OFFLINE"):
                diff = l_time - wait_start
                total_wait_minutes += diff.total_seconds() / 60.0
                wait_start = None
        
        if wait_start is not None:
            now = datetime.now(tokyo)
            diff = now - wait_start
            total_wait_minutes += max(0.0, diff.total_seconds() / 60.0)
            
        results.append({
            "driver_id": d["id"],
            "name": d["name"],
            "vehicle_number": d["vehicle_number"],
            "current_status": current_status,
            "last_action_time": last_action_time,
            "total_wait_minutes": round(total_wait_minutes, 1),
            "logs_count_today": len(logs)
        })
        
    conn.close()
    return results

@app.get("/api/logs/download")
def download_logs():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT logs.id, drivers.name, drivers.vehicle_number, logs.status, logs.timestamp, logs.note
        FROM logs
        JOIN drivers ON logs.driver_id = drivers.id
        ORDER BY logs.timestamp DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    
    output = io.StringIO()
    output.write('\ufeff')  # BOM for Excel
    writer = csv.writer(output)
    
    writer.writerow(["ログID", "ドライバー名", "車両番号", "運行ステータス", "記録時刻", "メモ"])
    
    status_map = {
        "OFFLINE": "業務終了 (未稼働)",
        "DRIVING": "運行中",
        "WAITING": "待機中 (荷待ち)",
        "WORKING": "荷役中 (積込/荷降)"
    }
    
    for r in rows:
        dt = datetime.fromisoformat(r["timestamp"])
        formatted_time = dt.strftime("%Y/%m/%d %H:%M:%S")
        writer.writerow([
            r["id"],
            r["name"],
            r["vehicle_number"],
            status_map.get(r["status"], r["status"]),
            formatted_time,
            r["note"] or ""
        ])
        
    csv_data = output.getvalue()
    output.close()
    
    return StreamingResponse(
        io.BytesIO(csv_data.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=drivlog_records.csv"}
    )

@app.get("/api/drivers/{driver_id}/logs/today")
def get_driver_today_logs(driver_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # ドライバーが存在するか確認
    cursor.execute("SELECT id FROM drivers WHERE id = ?", (driver_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Driver not found")
        
    tokyo = zoneinfo.ZoneInfo("Asia/Tokyo")
    today_str = datetime.now(tokyo).date().isoformat()
    
    cursor.execute(
        "SELECT status, timestamp, note FROM logs WHERE driver_id = ? AND timestamp >= ? ORDER BY timestamp ASC",
        (driver_id, today_str)
    )
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

@app.post("/api/reset")
def reset_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM logs")
    cursor.execute("DELETE FROM drivers")
    conn.commit()
    conn.close()
    init_db()
    return {"status": "success", "message": "Database has been reset to default values."}

# 静的ファイルの提供
app.mount("/", StaticFiles(directory="static", html=True), name="static")
