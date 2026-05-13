const Button = ({
  variant,
  onClick,
  disabled,
  children,
}: {
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

export default Button;
