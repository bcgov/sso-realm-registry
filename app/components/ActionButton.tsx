import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

interface StyledActionButtonProps {
  disabled?: boolean;
  activeColor?: string;
  isUnread?: boolean;
}

export const ActionButton = styled(({ disabled, activeColor, isUnread, ...props }) => (
  <FontAwesomeIcon {...props} />
))<StyledActionButtonProps>`
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  ${(props) =>
    props.disabled ? `color: #CACACA;` : `color: inherit; &:hover { color: ${props.activeColor || '#000'}; }`}
  ${(props) => (props.isUnread ? `color: #D8292F` : '')};
`;

interface Props {
  id?: string;
  title?: string;
  defaultActiveColor?: string;
  iconStyle?: any;
  onClick?: Function;
  disabled?: boolean;
  icon?: JSX.Element;
  size?: string;
}

export default function Actionbutton({
  id,
  title,
  defaultActiveColor,
  iconStyle = {},
  onClick,
  disabled,
  icon,
  size = 'lg',
}: Props) {
  return (
    <ActionButton
      disabled={disabled}
      icon={icon}
      role="button"
      data-testid={`action-button-${id}`}
      aria-label="edit"
      onClick={onClick}
      activeColor={defaultActiveColor}
      title={title}
      size={size}
      style={iconStyle}
    />
  );
}
