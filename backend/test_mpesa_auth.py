"""Check your M-Pesa setup from the terminal (reads backend/.env).

  python test_mpesa_auth.py                     -> checks the Consumer Key/Secret and prints the mode
  python test_mpesa_auth.py 0712345678 1        -> also sends a real STK prompt of KSh 1 to that phone

In the Daraja SANDBOX the prompt goes to Safaricom's simulator, not a real phone.
Real handset prompts need production credentials (Daraja "Go Live").
"""
import sys
import app

print("Mode        :", "MOCK (simulated)" if app.MPESA_MOCK_MODE else "LIVE")
print("Base URL    :", app.MPESA_BASE_URL)
print("Shortcode   :", app.MPESA_SHORTCODE, "| type:", app.MPESA_TRANSACTION_TYPE, "| PartyB:", app.MPESA_PARTY_B)
k, s_ = app.MPESA_CONSUMER_KEY, app.MPESA_CONSUMER_SECRET
print("Consumer Key:", (k[:4] + "..." + k[-4:]) if len(k) > 8 else ("(empty)" if not k else "(too short)"))
print("Secret      :", (s_[:2] + "..." + s_[-2:]) if len(s_) > 6 else ("(empty)" if not s_ else "(too short)"))
missing = app.mpesa_missing_config()
if missing:
    print("\nMissing in backend/.env:", ", ".join(missing))
    sys.exit(1)

try:
    app.get_mpesa_token()
    print("\nSUCCESS: Safaricom accepted your Consumer Key/Secret.")
except Exception as e:
    print("\nFAILED:", e)
    sys.exit(1)

if len(sys.argv) >= 3:
    phone = app.normalize_phone(sys.argv[1])
    amount = float(sys.argv[2])
    try:
        checkout_id, _ = app.initiate_stk(phone, amount, "TEST", "Stasho test")
        print(f"STK prompt sent to {phone} for KSh {amount:g}. CheckoutRequestID: {checkout_id}")
        print("Result check:", app.query_stk_result(checkout_id))
    except Exception as e:
        print("STK push FAILED:", e)
        sys.exit(1)