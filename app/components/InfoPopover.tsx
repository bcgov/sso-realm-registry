import React from 'react';
import OverlayTrigger, { OverlayTriggerType } from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import styled from 'styled-components';

const LeftMargin = styled.span`
  margin-left: 2px;
`;

const InfoPopover = ({
  icon = faInfoCircle,
  trigger = ['hover', 'focus'],
  children,
}: {
  icon?: IconDefinition;
  trigger?: OverlayTriggerType[];
  children: React.ReactNode;
}) => {
  return (
    <OverlayTrigger
      trigger={trigger}
      placement="right-start"
      overlay={
        <Popover id="popover-basic">
          <Popover.Body>{children}</Popover.Body>
        </Popover>
      }
      delay={{ show: 200, hide: 200 }}
    >
      <LeftMargin>
        <FontAwesomeIcon color="#777777" icon={icon} />
      </LeftMargin>
    </OverlayTrigger>
  );
};

export default InfoPopover;
