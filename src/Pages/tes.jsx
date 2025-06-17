import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

function Payment() {
  const location = useLocation();

  useEffect(() => {
    // Get query parameters from the current URL
    const queryParams = new URLSearchParams(location.search);

    // Check if we're already on andy.html to prevent redirect loops
    if (window.location.pathname === "/andy.html") {
      console.log("Already on payment page, skipping redirect");
      return;
    }

    // Construct the redirect URL with query parameters
    const redirectUrl = `/andy.html${location.search ? `?${queryParams.toString()}` : ""}`;

    try {
      // Validate required query parameters
      const requiredParams = ["public_key", "tx_ref", "amount", "email"];
      const missingParams = requiredParams.filter((param) => !queryParams.has(param));
      if (missingParams.length > 0) {
        console.error(`Missing required query parameters: ${missingParams.join(", ")}`);
        // Optionally, redirect to an error page or back to lessons
        window.location.href = "/mylessons?error=Missing+payment+parameters";
        return;
      }

      // Redirect to the payment page with query parameters
      console.log(`Redirecting to ${redirectUrl}`);
      window.location.href = redirectUrl;
    } catch (error) {
      console.error("Error during payment redirect:", error);
      window.location.href = "/mylessons?error=Payment+redirect+failed";
    }
  }, [location]);

  return null; // No rendering needed
}

export default Payment;