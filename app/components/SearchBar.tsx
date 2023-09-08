import React from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

const Wrapper = styled.div`
  width: 100%;
  position: relative;
`;

const Icon = styled.i`
  position: absolute;
  right: 0.5em;
  top: 0.5em;
  color: grey;
`;

const Input = styled.input`
  width: 100%;
  border: 2px solid #606060;
  padding: 0.3em 0.5em;
  border-radius: 0.25em;
`;

function SearchBar(props: any) {
  return (
    <Wrapper>
      <Input type="text" maxLength={100} {...props} />
      <Icon>
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      </Icon>
    </Wrapper>
  );
}

export default SearchBar;
