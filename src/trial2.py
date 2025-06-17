import requests
import uuid
from flask import Flask, request, jsonify
import threading
import sys
import os
import time

# Set UTF-8 encoding for console output
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# === CONFIGURATION ===
API_URL = "https://api.paychangu.com/mobile-money/payments/initialize"
API_KEY = "Bearer sec-test-5TzLXUOl9uXKtSlN0ZwwyBlqxOWhtrQB"
MOBILE_MONEY_OPERATOR_REF_ID = "20be6c20-adeb-4b5b-a7ba-0769820df4fb"

MOBILE_NUMBER = "981410178"
AMOUNT = "1000"
EMAIL = "andykaunda@dyuni.ac.mw"
FIRST_NAME = "Andy"
LAST_NAME = "Kaunda"
WEBHOOK_PORT = 5000
# =======================

# === WEBHOOK SERVER ===
app = Flask(__name__)

@app.route('/webhook/paychangu', methods=['POST'])
def webhook():
    try:
        # Verify Content-Type is application/json
        if not request.is_json:
            print(f"❌ Invalid Content-Type: {request.content_type}")
            return jsonify({"error": "Content-Type must be application/json"}), 400

        data = request.json
        if not data:
            print("❌ No JSON data received")
            return jsonify({"error": "No JSON data provided"}), 400

        print("\n🔔 [WEBHOOK RECEIVED]")
        print(f"Data: {data}")
        print(f"Headers: {request.headers}")

        # Validate required fields
        if "status" not in data or "charge_id" not in data:
            print("❌ Missing required fields in payload")
            return jsonify({"error": "Missing status or charge_id"}), 400

        if data.get("status") == "completed":
            print(f"✅ Payment completed for charge ID: {data.get('charge_id')}")
        else:
            print(f"⚠️ Payment status: {data.get('status')}")

        return jsonify({"message": "Webhook received"}), 200
    except Exception as e:
        print(f"❌ Webhook error: {str(e)}")
        print(f"Request headers: {request.headers}")
        print(f"Request data: {request.get_data(as_text=True)}")
        return jsonify({"error": "Failed to process webhook"}), 500

def start_webhook_server():
    try:
        print(f"[🌐] Starting webhook server on port {WEBHOOK_PORT}...")
        app.run(port=WEBHOOK_PORT, host='0.0.0.0', debug=False, use_reloader=False)
    except Exception as e:
        print(f"❌ Failed to start webhook server: {str(e)}")
        sys.exit(1)

# === INITIATE PAYMENT ===
def initiate_payment():
    try:
        charge_id = str(uuid.uuid4())

        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "Authorization": API_KEY
        }

        payload = {
            "mobile_money_operator_ref_id": MOBILE_MONEY_OPERATOR_REF_ID,
            "mobile": MOBILE_NUMBER,
            "amount": AMOUNT,
            "charge_id": charge_id,
            "email": EMAIL,
            "first_name": FIRST_NAME,
            "last_name": LAST_NAME
        }

        print("[🚀] Initiating payment...")
        response = requests.post(API_URL, json=payload, headers=headers)
        print("[RESPONSE]")
        print(f"Status Code: {response.status_code}")
        try:
            print(f"Response Body: {response.json()}")
        except ValueError:
            print(f"Response Body (non-JSON): {response.text}")

        if response.status_code != 200:
            print(f"⚠️ Payment initiation failed with status: {response.status_code}")
            return None

        return charge_id
    except Exception as e:
        print(f"❌ Payment initiation error: {str(e)}")
        return None

# === MAIN ENTRY ===
if __name__ == "__main__":
    # Start webhook server in a thread
    webhook_thread = threading.Thread(target=start_webhook_server, daemon=True)
    webhook_thread.start()

    # Give the server a moment to start
    time.sleep(2)

    # Initiate the payment
    charge_id = initiate_payment()

    if charge_id:
        print(f"\n💡 Now simulate webhook POST to: http://localhost:{WEBHOOK_PORT}/webhook/paychangu")
        print("🧪 Example CURL:\n")
        print(f"""curl -X POST http://localhost:{WEBHOOK_PORT}/webhook/paychangu \\
  -H "Content-Type: application/json" \\
  -d '{{"status":"completed","charge_id":"{charge_id}"}}'\n""")

        input("🔄 Press Enter after sending test webhook...\n")
    else:
        print("❌ Payment initiation failed. Exiting...")
        sys.exit(1)