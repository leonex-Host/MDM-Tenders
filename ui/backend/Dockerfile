FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Chrome (Selenium) + Playwright Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    ca-certificates \
    curl \
    # Playwright Chromium system-level deps
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright's Chromium binary only (deps already installed above via apt)
RUN playwright install chromium

# Copy application
COPY . .

# Create directories
RUN mkdir -p data logs

# Run the application
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]