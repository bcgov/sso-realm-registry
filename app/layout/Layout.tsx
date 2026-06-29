import Link from 'next/link';
import { useRouter } from 'next/router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCommentDots, faEnvelope, faFileAlt } from '@fortawesome/free-solid-svg-icons';
import styled from 'styled-components';
import Navigation from './Navigation';
import BottomAlertProvider from './BottomAlert';
import { useSession } from 'next-auth/react';
import { useEffect, useContext } from 'react';
import { User } from 'next-auth';
import { formatWikiURL } from 'utils/helpers';
import { useIdleTimer } from 'react-idle-timer';
import { ModalContext } from 'context/modal';
import { Nav } from 'react-bootstrap';
import { MICROSOFT_TEAMS_CHANNEL_LINK } from 'utils/constants';
import {
  NAV_APP_BAR_TEXT_COLOR,
  NAV_APP_BAR_MENU_ITEM_DIVIDER_COLOR,
  MAIN_NAV_APP_BAR_BOTTOM_BORDER_COLOR,
} from 'styles/theme';

const headerPlusFooterHeight = '152px';

const LoggedUser = styled.span`
  display: flex;
  align-items: center;
  font-weight: 700;
  color: ${NAV_APP_BAR_TEXT_COLOR};
  justify-content: end;
`;

const MainContent = styled.div`
  padding: 1rem 0;
  min-height: calc(100vh - ${headerPlusFooterHeight});
`;

const MobileSubMenu = styled.ul`
  padding-left: 2rem;
  padding-right: 2rem;
  a {
    color: ${NAV_APP_BAR_TEXT_COLOR};
  }
`;

const SubMenu = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding-left: 2rem;
  padding-right: 2rem;
`;

const SubRightMenu = styled.div`
  display: flex;
  gap: 1rem;

  & a {
    color: ${NAV_APP_BAR_TEXT_COLOR};
    border-right: 1px solid ${NAV_APP_BAR_MENU_ITEM_DIVIDER_COLOR};
    font-size: 0.9rem;
    padding-right: 15px;
    padding-top: 8px;
  }
`;

const FooterMenu = styled.div`
  padding: 1px;
  border-top: 2px solid ${MAIN_NAV_APP_BAR_BOTTOM_BORDER_COLOR};
  & ul {
    display: flex;
    gap: 1.5rem;
    list-style-type: none;
    padding-left: 3rem;
  }
  & a {
    color: ${NAV_APP_BAR_TEXT_COLOR};
    border-right: 1px solid ${NAV_APP_BAR_MENU_ITEM_DIVIDER_COLOR};
    font-size: 0.9rem;
    padding-right: 15px;
  }
`;

const HoverItem = styled.li`
  &:hover {
    opacity: 0.8;
  }
`;

const HeaderTitle = styled.div`
  margin-top: 15px;
  color: #fff;
`;

const LoginLogoutButton = styled.button`
  white-space: nowrap;
`;

interface Route {
  path: string;
  label: string | ((query: any) => string);
  hide?: boolean;
  roles: string[];
}

const routes: Route[] = [
  { path: '/', label: 'Home', roles: ['guest', 'user', 'sso-admin'] },
  { path: '/my-dashboard', label: 'My Dashboard', roles: ['user', 'sso-admin'] },
  { path: '/custom-realm-form', label: 'Request Custom Realm', roles: ['sso-admin', 'user'], hide: true },
  { path: '/custom-realm-dashboard', label: 'Custom Realm Dashboard', roles: ['sso-admin'] },
  { path: '/realm', label: 'Realm Profile', roles: ['user'], hide: true },
];

const LeftMenuItems = ({
  currentUser,
  currentPath,
  query,
  mobileMenu = false,
}: {
  currentUser: Partial<User>;
  currentPath: string;
  query: any;
  mobileMenu?: boolean;
}) => {
  let roles: string[] = ['guest'];

  if (currentUser) {
    roles = currentUser?.client_roles?.length! > 0 ? currentUser.client_roles! : ['user'];
  }

  const isCurrent = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`);

  return (
    <>
      {routes
        .filter((route) => route.roles.some((role) => roles.includes(role)) && (!route.hide || isCurrent(route.path)))
        .map((route) => {
          const label = typeof route.label === 'function' ? route?.label(query) : route.label;
          const showDivider = !mobileMenu;
          const style = {
            color: NAV_APP_BAR_TEXT_COLOR,
            borderRight: showDivider ? `1px solid ${NAV_APP_BAR_MENU_ITEM_DIVIDER_COLOR}` : '',
            fontWeight: 'normal',
            padding: '1px 15px',
            height: '32px',
            background: mobileMenu ? 'none' : undefined,
          };
          return (
            <Nav.Link key={route.path} as={Link} href={route.path} style={style} active={isCurrent(route.path)}>
              {label}
            </Nav.Link>
          );
        })}
    </>
  );
};

const RightMenuItems = () => (
  <>
    <li style={{ margin: '5px 0', color: '#fff' }}>Need help?</li>
    <HoverItem>
      <a href={MICROSOFT_TEAMS_CHANNEL_LINK} target="_blank" title="Our Microsoft Teams Channel.">
        <FontAwesomeIcon size="2x" icon={faCommentDots} />
      </a>
    </HoverItem>
    <HoverItem>
      <a href="mailto:bcgov.sso@gov.bc.ca" title="Pathfinder SSO">
        <FontAwesomeIcon size="2x" icon={faEnvelope} />
      </a>
    </HoverItem>
    <HoverItem>
      <a href={formatWikiURL()} target="_blank" title="Documentation">
        <FontAwesomeIcon size="2x" icon={faFileAlt} />
      </a>
    </HoverItem>
  </>
);

const modalContent = {
  title: `Session Expiring`,
  body: `Your session will expire soon and you will be signed out automatically. Do you want to stay signed in?`,
  showCancelButton: false,
  showConfirmButton: true,
};

// identity_provider, idir_userid, client_roles, family_name, given_name
function Layout({ children, onLoginClick, onLogoutClick }: any) {
  const router = useRouter();
  const session = useSession();
  const currentUser: Partial<User> = session?.data?.user!;
  const pathname = router.pathname;
  const { setModalConfig } = useContext(ModalContext);

  const checkSession = async () => {
    if (Date.now() > session?.data?.accessTokenExpiry * 1000) {
      const updatedSession = await session.update();
      if (updatedSession?.error === 'RefreshAccessTokenError') {
        onLogoutClick();
      }
    }
  };

  useEffect(() => {
    if (session?.status === 'authenticated') {
      const interval = setInterval(checkSession, 1000 * 1);
      return () => clearInterval(interval);
    }
  });

  useIdleTimer({
    onPrompt: (_event, timer) => {
      setModalConfig({
        ...modalContent,
        show: true,
        onConfirm: async () => {
          await session.update();
          timer?.reset();
        },
        onClose: () => {
          onLogoutClick();
        },
      });
    },
    onIdle: () => {
      setModalConfig({
        ...modalContent,
        show: false,
      });
      onLogoutClick();
    },
    timeout: 30 * 60 * 1000,
    promptBeforeIdle: 5 * 60 * 1000,
    disabled: !['authenticated', 'loading'].includes(session?.status),
  });

  const rightSide = currentUser ? (
    <LoggedUser>
      <div className="welcome" style={{ color: '#fff' }}>
        Welcome {`${currentUser?.given_name} ${currentUser?.family_name}`}
      </div>
      &nbsp;&nbsp;
      <LoginLogoutButton className="secondary-inverse" onClick={onLogoutClick} data-testid="desktop-logout-button">
        Log out
      </LoginLogoutButton>
    </LoggedUser>
  ) : (
    <LoginLogoutButton className="secondary-inverse" onClick={onLoginClick} data-testid="desktop-login-button">
      Log in
    </LoginLogoutButton>
  );

  const MobileMenu = ({
    currentUser,
    onLoginClick,
    onLogoutClick,
  }: {
    currentUser: any;
    onLoginClick: () => void;
    onLogoutClick: () => void;
  }) => {
    const router = useRouter();
    const pathname = router.pathname;
    const containerStyle = {
      color: NAV_APP_BAR_TEXT_COLOR,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: '1rem',
    };

    const linksContainerStyle = {
      display: 'flex',
      gap: '1rem',
      padding: '0 1rem',
    };

    const sectionPaddingStyle = {
      paddingLeft: '1rem',
    };

    const helpLinks = [
      {
        href: MICROSOFT_TEAMS_CHANNEL_LINK,
        title: 'Our Microsoft Teams Channel.',
        icon: faCommentDots,
      },
      {
        href: 'mailto:bcgov.sso@gov.bc.ca',
        title: 'Email SSO Team',
        icon: faEnvelope,
      },
      {
        href: formatWikiURL(),
        title: 'Documentation',
        icon: faFileAlt,
      },
    ];
    return (
      <MobileSubMenu>
        <LeftMenuItems currentUser={currentUser} currentPath={pathname} query={router.query} mobileMenu />

        <div style={containerStyle}>
          <div>Need Help?</div>

          <div style={linksContainerStyle}>
            {helpLinks.map(({ href, title, icon }) => (
              <Nav.Link key={title} href={href} target="_blank" title={title}>
                <FontAwesomeIcon size="2x" icon={icon} />
              </Nav.Link>
            ))}
          </div>
        </div>
        {currentUser ? (
          <LoginLogoutButton className="secondary-inverse" onClick={onLogoutClick} data-testid="desktop-logout-button">
            Log out
          </LoginLogoutButton>
        ) : (
          <LoginLogoutButton className="secondary-inverse" onClick={onLoginClick} data-testid="desktop-login-button">
            Log in
          </LoginLogoutButton>
        )}
      </MobileSubMenu>
    );
  };

  return (
    <>
      <Navigation
        title={() => <HeaderTitle>Keycloak Realm Registry</HeaderTitle>}
        rightSide={rightSide}
        mobileMenu={<MobileMenu currentUser={currentUser} onLoginClick={onLoginClick} onLogoutClick={onLogoutClick} />}
        onBannerClick={console.log}
      >
        <SubMenu>
          <div
            style={{
              display: 'flex',
            }}
          >
            <LeftMenuItems currentUser={currentUser} currentPath={pathname} query={router.query} />
          </div>
          <SubRightMenu>
            <RightMenuItems />
          </SubRightMenu>
        </SubMenu>
      </Navigation>
      <MainContent>
        <BottomAlertProvider>{children}</BottomAlertProvider>
      </MainContent>
      <div style={{ background: '#003366' }}>
        <FooterMenu>
          <ul className="text-small">
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <a href="https://www2.gov.bc.ca/gov/content/home/disclaimer" target="_blank" rel="noreferrer">
                Disclaimer
              </a>
            </li>
            <li>
              <a href="https://www2.gov.bc.ca/gov/content/home/privacy" target="_blank" rel="noreferrer">
                Privacy
              </a>
            </li>
            <li>
              <a href="https://www2.gov.bc.ca/gov/content/home/accessible-government" target="_blank" rel="noreferrer">
                Accessibility
              </a>
            </li>
            <li>
              <a href="https://www2.gov.bc.ca/gov/content/home/copyright" target="_blank" rel="noreferrer">
                Copyright
              </a>
            </li>
          </ul>
        </FooterMenu>
      </div>
    </>
  );
}
export default Layout;
