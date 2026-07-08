FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create folders for the database and uploads and give them write permissions
RUN mkdir -p uploads chroma_db && chmod -R 777 uploads chroma_db frontend

# Hugging Face Spaces uses port 7860
EXPOSE 7860

# Run the FastAPI server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
