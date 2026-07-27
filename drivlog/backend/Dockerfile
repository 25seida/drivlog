FROM python:3.11-slim

# Timezoneの設定 (Asia/Tokyo)
ENV TZ=Asia/Tokyo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# 依存関係のインストール
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# バックエンドコードとスタティックファイルのコピー
COPY backend/ /app/
COPY static/ /app/static/

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
