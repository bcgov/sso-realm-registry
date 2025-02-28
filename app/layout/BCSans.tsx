import { TypographyStyle } from 'react-typography';
import typography from '@button-inc/bcgov-theme/typography';
import '@bcgov/bc-sans/css/BCSans.css';

export default function BCSans() {
  typography.options.baseFontSize = '16px';
  typography.options.bodyColor = '#292929';
  return <TypographyStyle typography={typography} />;
}
