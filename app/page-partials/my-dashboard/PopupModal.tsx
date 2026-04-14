import { useState, useEffect } from 'react';
import styled from 'styled-components';
import CenteredModal from 'components/CenteredModal';
import Modal from 'react-bootstrap/Modal';
import RadioGroup from 'components/RadioGroup';
import { answerSurvey } from 'services/survey';
import { ModalData } from 'types/realm-profile';

const AlignCenter = styled.div`
  text-align: center;
`;

const BoldItem = styled.p`
  font-weight: 700;

  & div {
    font-weight: 400;
  }

  & .italic {
    font-style: italic;
    font-size: 0.8em;
  }
`;

interface Props {
  open: boolean;
  onAnswer: (val: boolean) => void;
}

function PopupModal({ open, onAnswer }: Props) {
  const [data, setData] = useState<ModalData>({});
  const [show, setShow] = useState<boolean>(false);

  useEffect(() => {
    setShow(open);
  }, [open]);

  const handleChange = (groupId: string, value: string) => {
    delete data.when_to_move;
    setData({ ...data, [groupId]: value });
  };

  const handleClose = async () => {
    const [, err] = await answerSurvey(data);
    if (err) onAnswer(false);
    else onAnswer(true);
    setShow(false);
  };

  return (
    <CenteredModal id="realm-migration" show={show} onHide={handleClose}>
      <Modal.Header closeButton>Standard Realm Migration</Modal.Header>
      <Modal.Body>
        <div style={{ fontWeight: 'bold' }}>Please complete the question below:</div>
        <hr />
        <BoldItem>
          Would you like to move your Custom realm to a Shard Realm?
          <RadioGroup
            groupId="willing_to_move"
            options={[
              { value: 'yes', name: 'Yes' },
              { value: 'no', name: 'No' },
            ]}
            onChange={handleChange}
          />
          <div className="italic">
            *If you have more than one realm, would you like to migrate at least one of them?
          </div>
        </BoldItem>
        {data.willing_to_move === 'no' && (
          <BoldItem>
            Would you be willing to migrate to a Standard Realm, within the following timeframes?
            <RadioGroup
              groupId="when_to_move"
              options={[
                { value: '6month', name: '6 Month' },
                { value: '12month', name: '12 Months' },
                { value: 'notAnytimeSoon', name: 'Not Anytime Soon' },
              ]}
              onChange={handleChange}
            />
          </BoldItem>
        )}
        {(data.willing_to_move === 'yes' || data.when_to_move === '6month' || data.when_to_move === '12month') && (
          <BoldItem>
            Thank you for choosing to migrate to a Custom realm. The SSO team will send you an email with next steps,
            within the next 5 business days.
          </BoldItem>
        )}
        {data.willing_to_move === 'no' && data.when_to_move === 'notAnytimeSoon' && (
          <BoldItem>
            Thank you for your response. The SSO team will reach out to you to understand your business constraints
            about migrating to a Standard Realm.
          </BoldItem>
        )}
        {data.willing_to_move === 'yes' || (data.willing_to_move === 'no' && data.when_to_move) ? (
          <AlignCenter>
            <button type="submit" className="primary" onClick={handleClose}>
              Close
            </button>
          </AlignCenter>
        ) : (
          <AlignCenter>
            <button type="submit" className="primary" onClick={() => setShow(false)}>
              I will answer another time
            </button>
          </AlignCenter>
        )}
      </Modal.Body>
    </CenteredModal>
  );
}

export default PopupModal;
