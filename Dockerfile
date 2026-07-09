FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create folders for uploads and give them write permissions
RUN mkdir -p uploads && chmod -R 777 uploads frontend

# Render injects $PORT at runtime; default to 10000
EXPOSE 10000

# Use shell form so $PORT is expanded at runtime
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000}
