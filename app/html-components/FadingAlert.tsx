import React, { useState, useEffect } from 'react';
import Alert from 'react-bootstrap/Alert';

interface props {
  variant?: string;
  size?: string;
  closable?: boolean;
  content?: string;
  fadeOut?: number;
  children?: React.ReactNode;
}

const FadingAlert = ({ children, variant, size, closable, fadeOut }: props) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timeout = fadeOut
      ? setTimeout(() => {
          setShow(false);
        }, fadeOut)
      : null;

    return () => {
      timeout && clearTimeout(timeout);
    };
  }, []);

  if (!show) return null;

  return (
    <Alert
      variant={variant}
      onClose={() => setShow(false)}
      className="mb-0"
      style={{ color: '#a12622' }}
      dismissible={closable}
    >
      {children}
    </Alert>
  );
};

export default FadingAlert;
