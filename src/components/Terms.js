import React from 'react';
import { Link } from 'react-router-dom';

const Terms = () => {
  return (
    <div className="terms-container">
      <div className="terms-content">
        <h1>Terms & Conditions</h1>
        <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
        
        <h2>1. Loan Agreement</h2>
        <p>
          By using this foundation lending system, you agree that:
        </p>
        <ul>
          <li>The foundation/makeup products are on loan, not for sale.</li>
          <li>Products must be picked up and returned in person within the specified time window.</li>
          <li>The time window begins from the moment your request is approved by an administrator.</li>
        </ul>

        <h2>2. Pickup and Return Policy</h2>
        <ul>
          <li>You have <strong>20 minutes</strong> from approval to pick up the item.</li>
          <li>Your chosen duration (30 minutes or 1 hour) begins at approval time.</li>
          <li>Total time from approval to return = 20 minutes + chosen duration.</li>
          <li>If you fail to return the item on time, your account will be restricted.</li>
        </ul>

        <h2>3. Consequences of Late Return</h2>
        <ul>
          <li>Account restriction: you will not be able to submit new requests.</li>
          <li>Your restriction will be noted in the system.</li>
          <li>Contact the administrator to resolve the restriction.</li>
          <li>Additional real-world consequences may apply as determined by the organization.</li>
        </ul>

        <h2>4. Identification Requirement</h2>
        <ul>
          <li>You must submit a valid ID with every request.</li>
          <li>Your ID will be stored securely and used only for verification purposes.</li>
          <li>Only authorized administrators can view your ID and personal information.</li>
          <li>Your ID is required for each new request to ensure proper identification.</li>
        </ul>

        <h2>5. Privacy and Data Usage</h2>
        <ul>
          <li>Your personal information (full name, ID) is stored securely.</li>
          <li>Your data is only accessible to you and authorized administrators.</li>
          <li>Your data will not be shared with third parties.</li>
          <li>You can request deletion of your data by contacting an administrator.</li>
        </ul>

        <h2>6. Account Responsibility</h2>
        <ul>
          <li>You are responsible for all activity under your account.</li>
          <li>Keep your login credentials secure.</li>
          <li>Report any unauthorized access immediately.</li>
        </ul>

        <h2>7. Modification of Terms</h2>
        <p>
          These terms may be updated from time to time. You will be notified of any significant changes.
        </p>

        <h2>8. Contact</h2>
        <p>
          For any questions or concerns, please contact the system administrator.
        </p>

        <div className="terms-actions">
          <Link to="/signup" className="btn-primary">Back to Sign Up</Link>
        </div>
      </div>
    </div>
  );
};

export default Terms;