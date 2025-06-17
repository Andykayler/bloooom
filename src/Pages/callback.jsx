import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function PaymentCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const txRef = queryParams.get('tx_ref');
    const status = queryParams.get('status'); // PayChangu may include status
    const transactionId = queryParams.get('transaction_id'); // Optional

    // Simulate a postMessage to match your existing logic
    window.postMessage(
      {
        type: 'PAYMENT_RESPONSE',
        response: {
          status: status || 'failed', // Adjust based on PayChangu's response
          tx_ref: txRef,
          transaction_id: transactionId,
          message: status === 'successful' ? 'Payment successful' : 'Payment failed or cancelled',
        },
      },
      window.location.origin
    );

    // Redirect to /mylessons
    navigate('/mylessons');
  }, [navigate, location]);

  return (
    <div>
      <h2>Processing Payment Callback...</h2>
      <p>Redirecting...</p>
    </div>
  );
}

export default PaymentCallback;