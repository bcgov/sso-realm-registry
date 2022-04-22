import React from 'react';
import styled from 'styled-components';

const CIRCLE_DIAMETER = '30px';
const CIRCLE_MARGIN = '10px';

const Circle = styled.div<{ variant: string }>`
  height: ${CIRCLE_DIAMETER};
  width: ${CIRCLE_DIAMETER};
  min-width: ${CIRCLE_DIAMETER};
  text-align: center;
  line-height: ${CIRCLE_DIAMETER};
  border-radius: ${CIRCLE_DIAMETER};
  background-color: ${(props) => (props.variant === 'primary' ? 'black' : '#777777')};
  color: ${(props) => (props.variant === 'primary' ? '#777777' : 'white')};
  font-weight: bold;
  margin: ${CIRCLE_MARGIN};
  margin-left: 0;
`;

const Line = styled.div`
  border-left: 1px solid #bcbcbc;
  margin-left: calc(${CIRCLE_DIAMETER} / 2);
`;

const ContentContainer = styled.div`
  display: grid;
  grid-template-columns: 50px 1fr;
`;

const TitleContainer = styled.div<{ variant: string }>`
  display: flex;
  align-items: center;
  flex-direction: row;
  margin-top: 10px;

  & h2 {
    margin: 0;
    color: ${(props) => (props.variant === 'primary' ? 'black' : '#777777')};
    font-size: ${(props) => (props.variant === 'primary' ? '22px' : '18px')};
  }
`;

interface Props {
  symbol: string;
  title: string;
  showLine?: boolean;
  children?: any;
  variant?: string;
}

export default function NumberedContents({ symbol, title, children, showLine = true, variant = 'primary' }: Props) {
  return (
    <div>
      <TitleContainer variant={variant}>
        <Circle variant={variant}>{symbol}</Circle>
        <h2>{title} </h2>
      </TitleContainer>
      <ContentContainer>
        {showLine ? <Line /> : <span />}
        <div>{children}</div>
      </ContentContainer>
    </div>
  );
}
