import styled from 'styled-components';
import { isFunction } from 'lodash';
import { MediaRule } from 'components/ResponsiveContainer';
import { Col, Container, Nav, Navbar, Row } from 'react-bootstrap';
import { MAIN_NAV_APP_BAR_BOTTOM_BORDER_COLOR, MAIN_NAV_APP_BAR_COLOR, SUB_NAV_APP_BAR_COLOR } from 'styles/theme';
import Image from 'next/image';
import { NavCollapseSVG } from 'components/NavCollapseSVG';

const mediaRules: MediaRule[] = [
  {
    maxWidth: 900,
    marginTop: 0,
    marginLeft: 10,
    marginUnit: 'px',
    horizontalAlign: 'none',
  },
  {
    width: 480,
    marginTop: 0,
    marginLeft: 2.5,
    marginUnit: 'rem',
    horizontalAlign: 'none',
  },
];

const BannerLogo = styled.div`
  height: 90%;
  max-width: 180px;
`;

const Title = styled.h1`
  font-weight: normal;
  margin-top: 10px;
`;

const DEFAULT_MOBILE_BREAK_POINT = '900';

function Navigation(props: any) {
  const {
    title = '',
    onBannerClick = () => null,
    children,
    mobileMenu,
    mobileBreakPoint = DEFAULT_MOBILE_BREAK_POINT,
    rightSide,
  } = props;
  const context = { mobileBreakPoint };

  return (
    // <BaseNavigation>
    //   <BaseHeader>
    //     <BaseHeader.Group className="banner">
    //       <ResponsiveContainer rules={mediaRules}>
    //         <BannerLogo onClick={onBannerClick}>{bcgovLogoSVG}</BannerLogo>
    //       </ResponsiveContainer>
    //     </BaseHeader.Group>
    //     <BaseHeader.Item collapse={mobileBreakPoint}>
    //       <Title>{isFunction(title) ? title(context) : title}</Title>
    //     </BaseHeader.Item>

    //     {rightSide && (
    //       <BaseHeader.Item
    //         collapse={mobileBreakPoint}
    //         style={{ marginLeft: 'auto', marginBottom: 'auto', marginTop: 'auto' }}
    //       >
    //         {rightSide}
    //       </BaseHeader.Item>
    //     )}

    //     <BaseHeader.Item
    //       expand={mobileBreakPoint}
    //       style={{ marginLeft: 'auto', fontSize: '2rem', marginBottom: 'auto', marginTop: 'auto' }}
    //     >
    //       <BaseNavigation.Toggle>
    //         <FaSVG>
    //           <path fill="currentColor" d={Bars} />
    //         </FaSVG>
    //       </BaseNavigation.Toggle>
    //     </BaseHeader.Item>
    //   </BaseHeader>

    //   <BaseHeader header="sub" collapse={mobileBreakPoint}>
    //     {children}
    //   </BaseHeader>
    //   <BaseNavigation.Sidebar>{mobileMenu ? mobileMenu() : children}</BaseNavigation.Sidebar>
    // </BaseNavigation>

    <Navbar expand="lg" className="py-0">
      <Container fluid className="px-0 flex-column">
        <Row
          className="w-100 align-items-center py-2"
          style={{
            background: MAIN_NAV_APP_BAR_COLOR,
            borderBottom: `2px solid ${MAIN_NAV_APP_BAR_BOTTOM_BORDER_COLOR}`,
            paddingLeft: '2rem',
          }}
        >
          <Col xs="auto">
            <Navbar.Brand href="#">
              <Image
                src="/bc_logo_header.svg"
                alt="BC Government Logo"
                width={150}
                height={50}
                onClick={onBannerClick}
              />
            </Navbar.Brand>
          </Col>

          <Col className="d-none d-lg-block" style={{ whiteSpace: 'nowrap' }}>
            <Title>{isFunction(title) ? title(context) : title}</Title>
          </Col>

          <Col className="text-end mx-5 d-none d-lg-block">{rightSide}</Col>

          <Col xs="auto" className="ms-auto d-lg-none">
            <Navbar.Toggle aria-controls="main-navbar-nav" className="border-0">
              <NavCollapseSVG />
            </Navbar.Toggle>
          </Col>
        </Row>
        <Row className="w-100 align-items-center">
          <Navbar.Collapse
            id="main-navbar-nav"
            className="w-100 d-lg-flex justify-content-center py-2"
            style={{ background: SUB_NAV_APP_BAR_COLOR }}
          >
            <Nav className="w-100 px-2 pt-2 d-none d-lg-flex" data-testid="desktop-nav">
              {children}
            </Nav>

            <Nav className="d-lg-none flex-column mt-2" style={{ background: SUB_NAV_APP_BAR_COLOR }}>
              {mobileMenu}
            </Nav>
          </Navbar.Collapse>
        </Row>
      </Container>
    </Navbar>
  );
}

export default Navigation;
