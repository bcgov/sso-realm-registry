import styled from 'styled-components';

const RadioButton = ({ label, name, onChange }: { label: string; name: string; onChange: () => void }) => {
  return (
    <div>
      <input type="radio" id={`${name}-${label}`} name={name} onChange={onChange} />
      <label htmlFor={`${name}-${label}`} className="px-1">
        {label}
      </label>
    </div>
  );
};

const HoritonzalRadioButton = styled(RadioButton)`
  display: inline-block;
  margin-right: 8px;
`;

interface RadioGroupOptions {
  value: string;
  name: string;
}

interface Props {
  groupId: string;
  options: RadioGroupOptions[];
  onChange: (v1: string, v2: string) => void;
  style?: any;
  direction?: 'horizontal' | 'vertical';
}

function RadioGroup({ groupId, options, onChange, direction, style = {} }: Props) {
  const handleChange = (value: string) => {
    onChange(groupId, value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: direction === 'horizontal' ? 'row' : 'column', ...style }}>
      {options.map(({ name, value }) => {
        return <RadioButton key={value} label={name} name={groupId} onChange={() => handleChange(value)} />;
      })}
    </div>
  );
}

export default RadioGroup;
