import styled from 'styled-components';
import { faCircleCheck, faHourglass } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

type Variant = 'pending' | 'complete';
interface Props {
  variant: Variant;
}

const SBadge = styled.span<{ variant: Variant }>`
  background: ${(props) => (props.variant === 'pending' ? 'rgb(246, 185, 0)' : 'rgb(60, 133, 60)')};
  color: white;
  border-radius: 0.3em;
  font-size: 0.65em;
  padding: 0.3em 0.5em;
  font-weight: bold;

  .icon {
    padding-right: 0.5em;
  }
`;

export default function Badge({ variant }: Props) {
  const text = variant === 'pending' ? 'In Progress' : 'Complete';
  return (
    <SBadge variant={variant}>
      <FontAwesomeIcon icon={variant === 'pending' ? faHourglass : faCircleCheck} className="icon" />
      {text}
    </SBadge>
  );
}
