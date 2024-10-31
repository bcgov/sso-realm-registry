import { sendEmail } from 'utils/ches';
import getConfig from 'next/config';
import { Session } from 'next-auth';
import { RealmProfile } from 'types/realm-profile';
import { Roster } from '@prisma/client';
import { generateRealmLinksByEnv, generateMasterRealmLinksByEnv, formatWikiURL } from './helpers';

const { serverRuntimeConfig = {} } = getConfig() || {};
const { app_env, sso_logout_redirect_uri } = serverRuntimeConfig;
const subjectPrefix = app_env === 'development' ? '[DEV] ' : '';
export const ssoTeamEmail = 'bcgov.sso@gov.bc.ca';

const emailHeader = `
<header style="color: #0e3468; text-align: center; margin-bottom: 30px; background: #f2f2f2; padding: 20px; box-shadow: 0 12px 6px -6px rgb(224, 224, 224);">
<div style="text-align: left; display: inline-block;">
    <svg width="203" height="81" viewBox="0 0 203 81" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M103.484 38.288C103.484 41.0747 102.472 43.304 100.448 44.976C98.4533 46.6187 95.608 47.44 91.912 47.44C88.5973 47.44 85.6347 46.8093 83.024 45.548V39.344C84.52 39.9893 86.06 40.5907 87.644 41.148C89.2573 41.676 90.856 41.94 92.44 41.94C94.0827 41.94 95.2413 41.632 95.916 41.016C96.62 40.3707 96.972 39.564 96.972 38.596C96.972 37.804 96.6933 37.1293 96.136 36.572C95.608 36.0147 94.8893 35.5013 93.98 35.032C93.0707 34.5333 92.0293 34.0053 90.856 33.448C90.1227 33.096 89.3307 32.6853 88.48 32.216C87.6293 31.7173 86.808 31.116 86.016 30.412C85.2533 29.6787 84.6227 28.7987 84.124 27.772C83.6253 26.7453 83.376 25.5133 83.376 24.076C83.376 21.26 84.3293 19.0747 86.236 17.52C88.1427 15.936 90.7387 15.144 94.024 15.144C95.6667 15.144 97.2213 15.3347 98.688 15.716C100.155 16.0973 101.709 16.64 103.352 17.344L101.196 22.536C99.7587 21.9493 98.468 21.4947 97.324 21.172C96.18 20.8493 95.0067 20.688 93.804 20.688C92.5427 20.688 91.5747 20.9813 90.9 21.568C90.2253 22.1547 89.888 22.9173 89.888 23.856C89.888 24.9707 90.3867 25.8507 91.384 26.496C92.3813 27.1413 93.8627 27.9333 95.828 28.872C97.4413 29.6347 98.8053 30.4267 99.92 31.248C101.064 32.0693 101.944 33.0373 102.56 34.152C103.176 35.2667 103.484 36.6453 103.484 38.288ZM138.718 38.288C138.718 41.0747 137.706 43.304 135.682 44.976C133.688 46.6187 130.842 47.44 127.146 47.44C123.832 47.44 120.869 46.8093 118.258 45.548V39.344C119.754 39.9893 121.294 40.5907 122.878 41.148C124.492 41.676 126.09 41.94 127.674 41.94C129.317 41.94 130.476 41.632 131.15 41.016C131.854 40.3707 132.206 39.564 132.206 38.596C132.206 37.804 131.928 37.1293 131.37 36.572C130.842 36.0147 130.124 35.5013 129.214 35.032C128.305 34.5333 127.264 34.0053 126.09 33.448C125.357 33.096 124.565 32.6853 123.714 32.216C122.864 31.7173 122.042 31.116 121.25 30.412C120.488 29.6787 119.857 28.7987 119.358 27.772C118.86 26.7453 118.61 25.5133 118.61 24.076C118.61 21.26 119.564 19.0747 121.47 17.52C123.377 15.936 125.973 15.144 129.258 15.144C130.901 15.144 132.456 15.3347 133.922 15.716C135.389 16.0973 136.944 16.64 138.586 17.344L136.43 22.536C134.993 21.9493 133.702 21.4947 132.558 21.172C131.414 20.8493 130.241 20.688 129.038 20.688C127.777 20.688 126.809 20.9813 126.134 21.568C125.46 22.1547 125.122 22.9173 125.122 23.856C125.122 24.9707 125.621 25.8507 126.618 26.496C127.616 27.1413 129.097 27.9333 131.062 28.872C132.676 29.6347 134.04 30.4267 135.154 31.248C136.298 32.0693 137.178 33.0373 137.794 34.152C138.41 35.2667 138.718 36.6453 138.718 38.288ZM183.941 31.248C183.941 34.504 183.398 37.3493 182.313 39.784C181.257 42.1893 179.614 44.0667 177.385 45.416C175.185 46.7653 172.383 47.44 168.981 47.44C165.578 47.44 162.762 46.7653 160.533 45.416C158.333 44.0667 156.69 42.1747 155.605 39.74C154.549 37.3053 154.021 34.46 154.021 31.204C154.021 27.948 154.549 25.1173 155.605 22.712C156.69 20.3067 158.333 18.444 160.533 17.124C162.762 15.7747 165.593 15.1 169.025 15.1C172.427 15.1 175.229 15.7747 177.429 17.124C179.629 18.444 181.257 20.3213 182.313 22.756C183.398 25.1613 183.941 27.992 183.941 31.248ZM161.017 31.248C161.017 34.5333 161.647 37.1293 162.909 39.036C164.17 40.9133 166.194 41.852 168.981 41.852C171.826 41.852 173.865 40.9133 175.097 39.036C176.329 37.1293 176.945 34.5333 176.945 31.248C176.945 27.9627 176.329 25.3813 175.097 23.504C173.865 21.5973 171.841 20.644 169.025 20.644C166.209 20.644 164.17 21.5973 162.909 23.504C161.647 25.3813 161.017 27.9627 161.017 31.248Z"
            fill="#0E3468" />
        <path
            d="M89.032 66.944C89.032 67.952 88.664 68.752 87.928 69.312C87.192 69.872 86.2 70.16 84.952 70.16C83.672 70.16 82.536 69.952 81.816 69.616V68.24C82.584 68.576 83.8 68.912 85.016 68.912C86.696 68.912 87.592 68.208 87.592 67.072C87.592 65.936 86.968 65.488 84.904 64.72C82.936 64.016 81.96 63.104 81.96 61.328C81.96 59.536 83.448 58.416 85.608 58.416C86.84 58.416 87.88 58.672 88.76 59.056L88.312 60.288C87.528 59.952 86.552 59.68 85.576 59.68C84.152 59.68 83.416 60.336 83.416 61.344C83.416 62.496 84.056 62.976 85.912 63.648C87.928 64.384 89.032 65.152 89.032 66.944ZM91.8613 58.208C92.2933 58.208 92.6773 58.48 92.6773 59.104C92.6773 59.728 92.2933 60 91.8613 60C91.3973 60 91.0293 59.728 91.0293 59.104C91.0293 58.48 91.3973 58.208 91.8613 58.208ZM91.1413 61.424H92.5493V70H91.1413V61.424ZM95.2663 61.424H96.4023L96.6103 62.592H96.6903C97.2503 61.696 98.3063 61.264 99.3943 61.264C101.442 61.264 102.498 62.224 102.498 64.416V70H101.106V64.512C101.106 63.136 100.466 62.448 99.1863 62.448C97.2823 62.448 96.6743 63.552 96.6743 65.552V70H95.2663V61.424ZM108.197 61.264C109.333 61.264 110.245 61.68 110.885 62.56H110.965L111.157 61.424H112.277V70.144C112.277 72.592 111.061 73.84 108.437 73.84C107.173 73.84 106.149 73.664 105.349 73.296V72C106.197 72.448 107.253 72.672 108.517 72.672C109.989 72.672 110.885 71.744 110.885 70.256V69.92C110.885 69.712 110.917 69.008 110.933 68.864H110.869C110.293 69.728 109.413 70.16 108.213 70.16C105.989 70.16 104.677 68.528 104.677 65.728C104.677 64.368 104.997 63.28 105.621 62.464C106.245 61.664 107.093 61.264 108.197 61.264ZM108.389 62.448C106.965 62.448 106.133 63.632 106.133 65.744C106.133 67.856 106.901 69.008 108.421 69.008C110.149 69.008 110.901 68.128 110.901 66.064V65.728C110.901 63.408 110.117 62.448 108.389 62.448ZM116.409 57.84V70H115.001V57.84H116.409ZM122.438 61.264C124.63 61.264 125.974 62.8 125.974 65.136V65.984H120.102C120.15 67.92 121.126 68.96 122.838 68.96C123.926 68.96 124.694 68.752 125.59 68.368V69.6C124.71 69.984 123.942 70.16 122.774 70.16C120.31 70.16 118.646 68.656 118.646 65.776C118.646 62.976 120.166 61.264 122.438 61.264ZM122.422 62.416C121.078 62.416 120.278 63.328 120.134 64.864H124.502C124.486 63.408 123.846 62.416 122.422 62.416ZM138.985 66.944C138.985 67.952 138.617 68.752 137.881 69.312C137.145 69.872 136.153 70.16 134.905 70.16C133.625 70.16 132.489 69.952 131.769 69.616V68.24C132.537 68.576 133.753 68.912 134.969 68.912C136.649 68.912 137.545 68.208 137.545 67.072C137.545 65.936 136.921 65.488 134.857 64.72C132.889 64.016 131.913 63.104 131.913 61.328C131.913 59.536 133.401 58.416 135.561 58.416C136.793 58.416 137.833 58.672 138.713 59.056L138.265 60.288C137.481 59.952 136.505 59.68 135.529 59.68C134.105 59.68 133.369 60.336 133.369 61.344C133.369 62.496 134.009 62.976 135.865 63.648C137.881 64.384 138.985 65.152 138.985 66.944ZM141.814 58.208C142.246 58.208 142.63 58.48 142.63 59.104C142.63 59.728 142.246 60 141.814 60C141.35 60 140.982 59.728 140.982 59.104C140.982 58.48 141.35 58.208 141.814 58.208ZM141.094 61.424H142.502V70H141.094V61.424ZM148.259 61.264C149.395 61.264 150.307 61.68 150.947 62.56H151.027L151.219 61.424H152.339V70.144C152.339 72.592 151.123 73.84 148.499 73.84C147.235 73.84 146.211 73.664 145.411 73.296V72C146.259 72.448 147.315 72.672 148.579 72.672C150.051 72.672 150.947 71.744 150.947 70.256V69.92C150.947 69.712 150.979 69.008 150.995 68.864H150.931C150.355 69.728 149.475 70.16 148.275 70.16C146.051 70.16 144.739 68.528 144.739 65.728C144.739 64.368 145.059 63.28 145.683 62.464C146.307 61.664 147.155 61.264 148.259 61.264ZM148.451 62.448C147.027 62.448 146.195 63.632 146.195 65.744C146.195 67.856 146.963 69.008 148.483 69.008C150.211 69.008 150.963 68.128 150.963 66.064V65.728C150.963 63.408 150.179 62.448 148.451 62.448ZM155.063 61.424H156.199L156.407 62.592H156.487C157.047 61.696 158.103 61.264 159.191 61.264C161.239 61.264 162.295 62.224 162.295 64.416V70H160.903V64.512C160.903 63.136 160.263 62.448 158.983 62.448C157.079 62.448 156.471 63.552 156.471 65.552V70H155.063V61.424ZM179.27 64.272C179.27 67.808 177.43 70.16 174.006 70.16C170.438 70.16 168.726 67.808 168.726 64.256C168.726 60.768 170.438 58.4 174.022 58.4C177.446 58.4 179.27 60.72 179.27 64.272ZM170.246 64.272C170.246 67.152 171.43 68.912 174.006 68.912C176.582 68.912 177.75 67.152 177.75 64.272C177.75 61.392 176.598 59.664 174.022 59.664C171.414 59.664 170.246 61.392 170.246 64.272ZM181.61 61.424H182.746L182.954 62.592H183.034C183.594 61.696 184.65 61.264 185.738 61.264C187.786 61.264 188.842 62.224 188.842 64.416V70H187.45V64.512C187.45 63.136 186.81 62.448 185.53 62.448C183.626 62.448 183.018 63.552 183.018 65.552V70H181.61V61.424Z"
            fill="#0E3468" />
        <g filter="url(#filter0_d_544_1233)">
            <circle cx="32" cy="44" r="30" fill="#0E3468" />
        </g>
        <path d="M44.5 26L62 43.5C61.6 63.5 48.5 74.5 29 74L20 66V39L32 18.5C38 18.5 42.8333 23.5 44.5 26Z"
            fill="#3D598C" />
        <path d="M19.5 39H27V30C27 26.5 30.5 25.5 32 25.5V18.5C23.6 18.5 19.5 24 19.5 30V39Z" fill="white" />
        <path d="M44.5 39H37V30C37 26.5 33.5 25.5 32 25.5V18.5C40.4 18.5 44.5 24 44.5 30V39Z" fill="#E8E8E8" />
        <path d="M32 39H15V57C15 64.5 21 67.5 26 67.5H32V39Z" fill="#FFD042" />
        <path d="M32 39H49V57C49 64.5 43 67.5 38 67.5H32V39Z" fill="#F6B900" />
        <path d="M28 60.5H32V46C30 46 28 48 28 50C28 51.6 29 53 29.5 53.5L28 60.5Z" fill="#DDAA10" />
        <path d="M36 60.5H32V46C34 46 36 48 36 50C36 51.6 35 53 34.5 53.5L36 60.5Z" fill="#BA8C00" />
        <defs>
            <filter id="filter0_d_544_1233" x="0" y="13" width="68" height="68" filterUnits="userSpaceOnUse"
                color-interpolation-filters="sRGB">
                <feFlood flood-opacity="0" result="BackgroundImageFix" />
                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                    result="hardAlpha" />
                <feOffset dx="2" dy="3" />
                <feGaussianBlur stdDeviation="2" />
                <feComposite in2="hardAlpha" operator="out" />
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0" />
                <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_544_1233" />
                <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_544_1233" result="shape" />
            </filter>
        </defs>
    </svg>
</div>
</header>
<p>Hello Pathfinder SSO friend,</p>
`;

const emailFooter = `
<p>Thank you, <br /> Pathfinder SSO Team</p>
<footer style="background: #f2f2f2; padding: 20px; box-shadow: 0px -12px 6px -6px rgb(224, 224, 224); margin-top: 30px;">
<div style="display: flex; justify-content: space-between;">
    <div>
        <div style="display: flex; align-items: center;">
            <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" color="#0e3468" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M10.8693 21.5102L11.5147 21.8922L10.8693 21.5102ZM11.1288 21.0719L10.4833 20.6899L11.1288 21.0719ZM8.87121 21.0719L9.51663 20.6899L9.51662 20.6899L8.87121 21.0719ZM9.13064 21.5102L8.48523 21.8922L9.13064 21.5102ZM2.30448 17.1308L2.99739 16.8438H2.99739L2.30448 17.1308ZM6.28931 19.585L6.31328 18.8354L6.28931 19.585ZM4.46927 19.2956L4.18225 19.9885H4.18225L4.46927 19.2956ZM17.6955 17.1308L18.3884 17.4178L18.3884 17.4178L17.6955 17.1308ZM13.7107 19.585L13.6867 18.8354L13.7107 19.585ZM15.5307 19.2956L15.8177 19.9885L15.5307 19.2956ZM16.09 6.58944L16.4819 5.94996V5.94996L16.09 6.58944ZM17.4106 7.91001L18.05 7.51814V7.51814L17.4106 7.91001ZM3.91001 6.58944L3.51813 5.94996V5.94996L3.91001 6.58944ZM2.58944 7.91001L1.94996 7.51814H1.94996L2.58944 7.91001ZM7.91637 19.8223L7.53453 20.4679H7.53453L7.91637 19.8223ZM11.5147 21.8922L11.7742 21.4539L10.4833 20.6899L10.2239 21.1282L11.5147 21.8922ZM8.22579 21.4539L8.48523 21.8922L9.77606 21.1282L9.51663 20.6899L8.22579 21.4539ZM10.2239 21.1282C10.1785 21.2049 10.0992 21.25 9.99998 21.25C9.90074 21.25 9.82147 21.2049 9.77606 21.1282L8.48523 21.8922C9.16217 23.0359 10.8378 23.0359 11.5147 21.8922L10.2239 21.1282ZM8.8 6.75H11.2V5.25H8.8V6.75ZM17.25 12.8V13.6H18.75V12.8H17.25ZM2.75 13.6V12.8H1.25V13.6H2.75ZM1.25 13.6C1.25 14.5217 1.24959 15.2504 1.2898 15.8397C1.33047 16.4357 1.41517 16.9436 1.61157 17.4178L2.99739 16.8438C2.88931 16.5828 2.82178 16.2573 2.78632 15.7376C2.75041 15.2112 2.75 14.5422 2.75 13.6H1.25ZM6.31328 18.8354C5.52102 18.81 5.09046 18.7411 4.75628 18.6027L4.18225 19.9885C4.77912 20.2357 5.43744 20.3081 6.26533 20.3346L6.31328 18.8354ZM1.61157 17.4178C2.09367 18.5817 3.01837 19.5064 4.18225 19.9885L4.75628 18.6027C3.95994 18.2728 3.32725 17.6401 2.99739 16.8438L1.61157 17.4178ZM17.25 13.6C17.25 14.5422 17.2496 15.2112 17.2137 15.7376C17.1782 16.2573 17.1107 16.5828 17.0026 16.8438L18.3884 17.4178C18.5848 16.9436 18.6695 16.4357 18.7102 15.8397C18.7504 15.2504 18.75 14.5217 18.75 13.6H17.25ZM13.7346 20.3346C14.5625 20.3081 15.2209 20.2357 15.8177 19.9885L15.2437 18.6027C14.9095 18.7411 14.479 18.81 13.6867 18.8354L13.7346 20.3346ZM17.0026 16.8438C16.6728 17.6401 16.0401 18.2728 15.2437 18.6027L15.8177 19.9885C16.9816 19.5064 17.9063 18.5817 18.3884 17.4178L17.0026 16.8438ZM11.2 6.75C12.5239 6.75 13.4641 6.75079 14.1953 6.82031C14.9154 6.88877 15.3548 7.01855 15.6981 7.22892L16.4819 5.94996C15.8633 5.57089 15.1671 5.40595 14.3373 5.32705C13.5187 5.24921 12.4949 5.25 11.2 5.25V6.75ZM18.75 12.8C18.75 11.5052 18.7508 10.4814 18.673 9.6627C18.5941 8.83288 18.4291 8.13673 18.05 7.51814L16.7711 8.30189C16.9814 8.64518 17.1112 9.08466 17.1797 9.80468C17.2492 10.5359 17.25 11.4761 17.25 12.8H18.75ZM15.6981 7.22892C16.1354 7.4969 16.5031 7.86458 16.7711 8.30189L18.05 7.51814C17.6584 6.879 17.121 6.34163 16.4819 5.94996L15.6981 7.22892ZM8.8 5.25C7.50515 5.25 6.48135 5.24921 5.66269 5.32705C4.83287 5.40595 4.13672 5.57089 3.51813 5.94996L4.30188 7.22892C4.64517 7.01855 5.08465 6.88877 5.80467 6.82031C6.53585 6.75079 7.47611 6.75 8.8 6.75V5.25ZM2.75 12.8C2.75 11.4761 2.75079 10.5359 2.82031 9.80468C2.88877 9.08466 3.01855 8.64518 3.22892 8.30189L1.94996 7.51814C1.57089 8.13673 1.40595 8.83288 1.32705 9.6627C1.24921 10.4814 1.25 11.5052 1.25 12.8H2.75ZM3.51813 5.94996C2.87899 6.34163 2.34162 6.879 1.94996 7.51814L3.22892 8.30189C3.4969 7.86458 3.86458 7.4969 4.30188 7.22892L3.51813 5.94996ZM9.51662 20.6899C9.31582 20.3506 9.13969 20.0516 8.96888 19.8164C8.78917 19.569 8.58327 19.3454 8.29822 19.1768L7.53453 20.4679C7.58064 20.4951 7.64427 20.5451 7.75524 20.6979C7.87511 20.863 8.01082 21.0907 8.2258 21.4539L9.51662 20.6899ZM6.26533 20.3346C6.71078 20.3489 6.99552 20.3587 7.21182 20.3851C7.41631 20.41 7.49305 20.4433 7.53453 20.4679L8.29822 19.1768C8.00853 19.0055 7.70371 18.9339 7.39344 18.8961C7.09498 18.8597 6.73177 18.8488 6.31328 18.8354L6.26533 20.3346ZM11.7742 21.4539C11.9891 21.0907 12.1249 20.863 12.2447 20.6979C12.3557 20.5451 12.4193 20.4951 12.4654 20.4679L11.7018 19.1768C11.4167 19.3454 11.2108 19.569 11.0311 19.8164C10.8603 20.0516 10.6841 20.3506 10.4833 20.6899L11.7742 21.4539ZM13.6867 18.8354C13.2682 18.8488 12.905 18.8597 12.6065 18.8961C12.2963 18.9339 11.9914 19.0055 11.7018 19.1768L12.4654 20.4679C12.5069 20.4433 12.5837 20.41 12.7881 20.3851C13.0044 20.3587 13.2892 20.3489 13.7346 20.3346L13.6867 18.8354Z"
                    fill="#0e3468" />
                <path
                    d="M21.7145 12.4351L22.4074 12.7221V12.7221L21.7145 12.4351ZM19.685 14.4646L19.972 15.1575H19.972L19.685 14.4646ZM20.2093 2.5526L19.8174 3.19208V3.19208L20.2093 2.5526ZM21.4473 3.79064L22.0868 3.39876V3.39876L21.4473 3.79064ZM8.79058 2.5526L8.3987 1.91312V1.91312L8.79058 2.5526ZM7.55255 3.79064L6.91307 3.39876H6.91307L7.55255 3.79064ZM13.3749 2.75H15.6249V1.25H13.3749V2.75ZM21.2499 8.37503V9.12503H22.7499V8.37503H21.2499ZM21.2499 9.12503C21.2499 10.0089 21.2495 10.6343 21.216 11.1258C21.1829 11.6106 21.1201 11.9101 21.0216 12.1481L22.4074 12.7221C22.5943 12.2709 22.6742 11.7891 22.7125 11.2279C22.7504 10.6735 22.7499 9.98841 22.7499 9.12503H21.2499ZM21.0216 12.1481C20.7171 12.8832 20.1331 13.4672 19.398 13.7717L19.972 15.1575C21.0747 14.7008 21.9507 13.8247 22.4074 12.7221L21.0216 12.1481ZM15.6249 2.75C16.867 2.75 17.7459 2.75079 18.4286 2.81571C19.1002 2.87956 19.5042 3.00013 19.8174 3.19208L20.6012 1.91312C20.0127 1.55247 19.352 1.39674 18.5706 1.32244C17.8004 1.24921 16.838 1.25 15.6249 1.25V2.75ZM22.7499 8.37503C22.7499 7.16201 22.7507 6.19958 22.6775 5.42935C22.6032 4.64796 22.4475 3.98729 22.0868 3.39876L20.8079 4.18251C20.9998 4.49574 21.1204 4.89973 21.1842 5.57133C21.2492 6.25408 21.2499 7.13296 21.2499 8.37503H22.7499ZM19.8174 3.19208C20.2211 3.43945 20.5605 3.77884 20.8079 4.18251L22.0868 3.39876C21.7158 2.79326 21.2067 2.28417 20.6012 1.91312L19.8174 3.19208ZM13.3749 1.25C12.1619 1.25 11.1995 1.24921 10.4293 1.32244C9.64789 1.39674 8.98723 1.55247 8.3987 1.91312L9.18245 3.19208C9.49568 3.00013 9.89967 2.87956 10.5713 2.81571C11.254 2.75079 12.1329 2.75 13.3749 2.75V1.25ZM8.3987 1.91312C7.7932 2.28417 7.28412 2.79326 6.91307 3.39876L8.19203 4.18251C8.43939 3.77884 8.77879 3.43945 9.18245 3.19208L8.3987 1.91312ZM7.78219 6.03896C7.83215 5.07858 7.95706 4.56594 8.19203 4.18251L6.91307 3.39876C6.47594 4.11209 6.33747 4.93717 6.28422 5.96104L7.78219 6.03896ZM18.0249 15.4848C18.7916 15.4593 19.4094 15.3906 19.972 15.1575L19.398 13.7717C19.096 13.8968 18.7039 13.9614 17.9751 13.9857L18.0249 15.4848Z"
                    fill="#0e3468" />
                <path d="M6.50928 13H6.51828M10 13H10.009M13.491 13H13.5" stroke="#0e3468" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <a href="https://chat.developer.gov.bc.ca/channel/sso" style="padding-left: 4px; color: #0e3468;">Rocket.Chat</a>
        </div>
        <div style="display: flex; align-items: center; ">
            <svg width="22px" height="22px" viewBox="0 0 32 32" enable-background="new 0 0 32 32" id="Stock_cut"
                version="1.1" xml:space="preserve" xmlns="http://www.w3.org/2000/svg"
                xmlns:xlink="http://www.w3.org/1999/xlink">
                <desc />
                <g>
                    <path d="M27,5V3H1v26   c0,1.105,0.895,2,2,2h26c1.105,0,2-0.895,2-2V5H27z" fill="none"
                        stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="2" />
                    <rect fill="none" height="8" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" width="10" x="5" y="19" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="27" x2="27" y1="5" y2="24" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="27" x2="27" y1="26" y2="28" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="4" x2="24" y1="11" y2="11" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="4" x2="24" y1="7" y2="7" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="4" x2="24" y1="15" y2="15" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="18" x2="24" y1="19" y2="19" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="18" x2="24" y1="23" y2="23" />
                    <line fill="none" stroke="#0e3468" stroke-linejoin="round" stroke-miterlimit="10"
                        stroke-width="2" x1="18" x2="24" y1="27" y2="27" />
                </g>
            </svg>
            <a href="https://subscribe.developer.gov.bc.ca/" style="padding-left: 4px; color: #0e3468;">Newsletter</a>
        </div>
    </div>
    <div>
        <div style="display: flex; align-items: center;">
            <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" color="black" xmlns="http://www.w3.org/2000/svg">
                <g id="Warning / Info">
                    <path id="Vector"
                        d="M12 11V16M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21ZM12.0498 8V8.1L11.9502 8.1002V8H12.0498Z"
                        stroke="#0e3468" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </g>
            </svg>
            <a href="${formatWikiURL()}" style="padding-left: 4px; color: #0e3468;">Knowledge Base</a>
        </div>
        <div style="display: flex; align-items: center;">
            <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M10 19H6.2C5.0799 19 4.51984 19 4.09202 18.782C3.71569 18.5903 3.40973 18.2843 3.21799 17.908C3 17.4802 3 16.9201 3 15.8V8.2C3 7.0799 3 6.51984 3.21799 6.09202C3.40973 5.71569 3.71569 5.40973 4.09202 5.21799C4.51984 5 5.0799 5 6.2 5H17.8C18.9201 5 19.4802 5 19.908 5.21799C20.2843 5.40973 20.5903 5.71569 20.782 6.09202C21 6.51984 21 7.0799 21 8.2V10M20.6067 8.26229L15.5499 11.6335C14.2669 12.4888 13.6254 12.9165 12.932 13.0827C12.3192 13.2295 11.6804 13.2295 11.0677 13.0827C10.3743 12.9165 9.73279 12.4888 8.44975 11.6335L3.14746 8.09863M14 21L16.025 20.595C16.2015 20.5597 16.2898 20.542 16.3721 20.5097C16.4452 20.4811 16.5147 20.4439 16.579 20.399C16.6516 20.3484 16.7152 20.2848 16.8426 20.1574L21 16C21.5523 15.4477 21.5523 14.5523 21 14C20.4477 13.4477 19.5523 13.4477 19 14L14.8426 18.1574C14.7152 18.2848 14.6516 18.3484 14.601 18.421C14.5561 18.4853 14.5189 18.5548 14.4903 18.6279C14.458 18.7102 14.4403 18.7985 14.405 18.975L14 21Z"
                    stroke="#0e3468" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <a href="mailto:bcgov.sso@gov.bc.ca" style="padding-left: 4px; color: #0e3468;">bcgov.sso@gov.bc.ca</a>
        </div>
    </div>
</ul>
</footer>
`;

export const sendUpdateEmail = async (realm: any, session: any, updatingApprovalStatus: boolean) => {
  const prefix = app_env === 'development' ? '[DEV] ' : '';
  let message: string = `
              <main>
                  <p>The information for your Custom Realm has been successfully updated within our Realm Registry.</p>
                  <p><strong>Realm: </strong>${realm.realm}<br /><strong>Updated by: </strong>${session.user?.given_name} ${session.user?.family_name}</p>
              </main>`;
  let subject = `${prefix}Notification: Realm ${realm.realm} Information Updated in Realm Registry`;

  if (updatingApprovalStatus && realm.approved === true) {
    message = `
          <main>
              <p>We're pleased to inform you that your request for the Custom Realm ${realm.realm} has been approved and is currently being processed.</p>
          </main>`;
    subject = `${prefix}Important: Your request for Custom Realm ${realm.realm} has been Approved (email 1 of 2)`;
  } else if (updatingApprovalStatus && realm.approved === false) {
    message = `
              <main>
                  <p>We regret to inform you that your request for the Custom Realm ${realm.realm} has been declined. A member of our SSO team will reach out to you shortly to provide further details on the reasons behind this decision.</p>
              </main>
              `;
    subject = `${prefix}Important: Your request for Custom Realm ${realm.realm} has been Declined`;
  }

  return await sendEmail({
    to: [realm.technicalContactEmail, realm.productOwnerEmail],
    cc: [ssoTeamEmail],
    body: `
          ${emailHeader}
          ${message}
          ${emailFooter}
      `,
    subject,
  });
};

export const sendRestoreEmail = async (realm: Roster, requester: string) => {
  const prefix = app_env === 'development' ? '[DEV] ' : '';
  const subject = `${prefix}Notification: Realm ${realm.realm} Restoration Requested`;

  const message = `
    <main>
      <p>We have received a request from ${requester} for the restoration of the ${realm.realm} custom realm. The restoration process will take approximately 24 hours. Please contact the SSO team if you have any concerns.</p>
    </main>
  `;

  return sendEmail({
    to: [realm.technicalContactEmail!, realm.productOwnerEmail!],
    cc: [ssoTeamEmail],
    body: `
          ${emailHeader}
          ${message}
          ${emailFooter}
      `,
    subject,
  });
};

export const sendCreateEmail = async (realm: Roster, session: Session) => {
  const prefix = app_env === 'development' ? '[DEV] ' : '';
  const username = `${session.user.given_name} ${session.user.family_name}`;
  return await sendEmail({
    to: [realm.technicalContactEmail!, realm.productOwnerEmail!],
    cc: [ssoTeamEmail],
    body: `
      ${emailHeader}
        <main>
            <p>We've received a request for the Custom Realm ${realm.realm}, submitted by ${username}. Rest assured, our team is actively reviewing your request and will be in touch shortly.</p>
        </main>
      ${emailFooter}
      `,
    subject: `${prefix}Confirmation: Your Request for Custom Realm ${realm.realm} Has Been Received`,
  });
};

export const sendDeleteEmail = async (realm: Roster, session: Session) => {
  const githubActionTriggerHour = '4:00 AM';
  const username = `${session.user.given_name} ${session.user.family_name}`;
  const to = [realm.technicalContactEmail!, realm.productOwnerEmail!].filter((email) => email);
  if (!to.length) return;

  return await sendEmail({
    to,
    cc: [ssoTeamEmail],
    body: `
        ${emailHeader}
        <p>We have received a request from ${username} for the deletion of Custom Realm ${realm.realm}. It will be deleted at approximately ${githubActionTriggerHour} as per our automated processes. Please contact the SSO team ASAP if you have any concerns.</p>
        ${emailFooter}
        `,
    subject: `${subjectPrefix}Important: Custom Realm ${realm.realm} is in the process of being Deleted.`,
  });
};

export const sendDeletionCompleteEmail = async (realm: Roster) => {
  const to = [realm.technicalContactEmail!, realm.productOwnerEmail!].filter((email) => email);
  if (!to.length) return;
  return await sendEmail({
    to,
    cc: [ssoTeamEmail],
    body: `
        ${emailHeader}
        <p>This is to inform you that Custom Realm ${realm.realm} has now been deleted.</p>
        ${emailFooter}
        `,
    subject: `${subjectPrefix}Notification: Custom Realm ${realm.realm} has now been Deleted.`,
  });
};

export const sendReadyToUseEmail = async (realm: Roster) => {
  const prefix = app_env === 'development' ? '[DEV] ' : '';
  const realmName = realm.realm!;
  return await sendEmail({
    cc: [ssoTeamEmail],
    to: [realm.technicalContactEmail!, realm.productOwnerEmail!],
    body: `
          ${emailHeader}
            <main>
            <p>Your custom realm ${realm.realm} is ready to be accessed.</p>
            <p>Please follow the instructions below to add Realm Admins:</p>
            <ol>
              <li>
                <p>You are a Realm Admin: Please save these links below for logging in via the master realm:</p>
                <ul>
                  <li><p><code><a href="${generateMasterRealmLinksByEnv(
                    'dev',
                    realmName,
                  )}">${generateMasterRealmLinksByEnv('dev', realmName)}</a></p></code></li>
                  <li><p><code><a href="${generateMasterRealmLinksByEnv(
                    'test',
                    realmName,
                  )}"></a>${generateMasterRealmLinksByEnv('test', realmName)}</p></code></li>
                  <li><p><code><a href="${generateMasterRealmLinksByEnv(
                    'prod',
                    realmName,
                  )}">${generateMasterRealmLinksByEnv('prod', realmName)}</a></p></code></li>
                </ul>
              </li>
              <li>
                <p>You must have your identity provider configured. Please follow these <a href="https://stackoverflow.developer.gov.bc.ca/questions/864">instructions</a></strong></p>
              </li>
              <li>
                <p> User friendly URLS and configure additional realm admins. To add yourself and others as realm admins via a user friendly url:</p>
                <ol type="a">
                  <li>
                    <p>Log into your custom realm using below links so that you and other admins can be imported into the custom realm</p>
                    <ul>
                      <li>
                      <p><code><a href="${generateRealmLinksByEnv('dev', realmName)}">${generateRealmLinksByEnv(
      'dev',
      realmName,
    )}</a></code></p>
                      </li>
                      <li>
                      <p><code><a href="${generateRealmLinksByEnv('test', realmName)}">${generateRealmLinksByEnv(
      'test',
      realmName,
    )}</a></code></p>
                      </li>
                      <li>
                      <p><code><a href="${generateRealmLinksByEnv('prod', realmName)}">${generateRealmLinksByEnv(
      'prod',
      realmName,
    )}</a></code></p>
                      </li>
                      </ul>
                  </li>
                  <li>
                    <p>At this point you cannot log in, and might see a loading spinner or a <code>forbidden</code> message. Exit from the browser and continue with next step.</p>
                  </li>
                  <li>
                    <p>One of the existing Realm Admins will need to add the user that logged in to #1 above to the custom realm admin group via the <strong>master</strong> links</p>
                    <ul>
                      <li>
                        <p><code><a href="${generateMasterRealmLinksByEnv(
                          'dev',
                          realmName,
                        )}">${generateMasterRealmLinksByEnv('dev', realmName)}</a></code></p>
                      </li>
                      <li><p><code><a href="${generateMasterRealmLinksByEnv(
                        'test',
                        realmName,
                      )}">${generateMasterRealmLinksByEnv('test', realmName)}</a></code></p></li>
                      <li><p><code><a href="${generateMasterRealmLinksByEnv(
                        'prod',
                        realmName,
                      )}">${generateMasterRealmLinksByEnv('prod', realmName)}</a></code></p></li>
                    </ul>
                  </li>
                  <li>
                    <p>Once you&rsquo;ve done this, you and your realm admins can access your realm via a more user friendly url</p>
                    <p><span style="color: #ff0000;"><strong>PLEASE SAVE THIS USER FRIENDLY LINK</strong></span> as User Friendly Realm Admin Links</p>
                    <ul>
                      <li><p><code><a href="${generateRealmLinksByEnv('dev', realmName)}">${generateRealmLinksByEnv(
      'dev',
      realmName,
    )}</a></code></p></li>
                      <li><p><code><a href="${generateRealmLinksByEnv('test', realmName)}">${generateRealmLinksByEnv(
      'test',
      realmName,
    )}</a></code></p></li>
                      <li><p><code><a href="${generateRealmLinksByEnv('prod', realmName)}">${generateRealmLinksByEnv(
      'prod',
      realmName,
    )}</a></code></p></li>
                      </ul>
                  </li>
                </ol>
              </li>
            </ol>
            <p>If you have any questions or require further assistance, feel free to reach out to us by Rocket.Chat or email at: <a href="mailto:bcgov.sso@gov.bc.ca">bcgov.sso@gov.bc.ca</a></p>
            </main>
          ${emailFooter}
          `,
    subject: `${prefix}Important: Custom Realm ${realmName} Created and Action Required for Realm Admin Configuration (email 2 of 2)`,
  });
};

export const onboardNewRealmAdmin = async (
  session: Session,
  realm: Roster,
  oldContact: string,
  newContact: string,
  contactType: string,
) => {
  const nonUpdatedTeamMemberEmail = contactType.startsWith('Product')
    ? realm.technicalContactEmail
    : realm.productOwnerEmail;
  const username = `${session.user.given_name} ${session.user.family_name}`;
  const realmName = realm.realm!;
  const to = [newContact!, nonUpdatedTeamMemberEmail!].filter((email) => email);
  if (!to.length) return;
  return await sendEmail({
    to,
    cc: [ssoTeamEmail],
    body: `
        ${emailHeader}
        <p>
          We're reaching out to update you on changes to the ${contactType} details within the ${
      realm.realm
    } Custom realm. As of
          ${new Date().toLocaleDateString()}, ${username} has modified the contact information in the Realm Registry, replacing ${oldContact} with the
          updated information for the ${realm.realm}. We want to ensure you're informed about these recent updates.
        </p>
        <p>To ensure a smooth transition, please follow instructions below to make ${newContact} the Realm Admin</p>
        <strong>Grant Realm Admin Access to the new team members</strong>
        <p>To add others as realm admins via a user friendly URL:</p>
        <ol type="a">
          <li>
            <p>Ask your new team member to login at</p>
            <ul>
            <li><p><code><a href="${generateRealmLinksByEnv('dev', realmName)}">${generateRealmLinksByEnv(
      'dev',
      realmName,
    )}</a></code></p></li>
            <li><p><code><a href="${generateRealmLinksByEnv('test', realmName)}">${generateRealmLinksByEnv(
      'test',
      realmName,
    )}</a></code></p></li>
            <li><p><code><a href="${generateRealmLinksByEnv('prod', realmName)}">${generateRealmLinksByEnv(
      'prod',
      realmName,
    )}</a></code></p></li>
            </ul>
          </li>
          <li>
            <p>They will see a forbidden message <code>Forbidden: You don't have access to the requested resource</code></p>
          </li>
          <li>
            <p>You or one of the existing Realm Admins will need to add the user that logged in. See image below.</p>
            <img src="${sso_logout_redirect_uri}/onboard-realm-admin.png" alt="OnBoardNewRealmAdmin" style="width:650px">
          </li>
          <li>
            <p>Once you&rsquo;ve done this, you and your realm admins can access your realm via a more user friendly url</p>
            <p>
              <span style="color: #ff0000"><strong>PLEASE SAVE THIS USER FRIENDLY LINK</strong></span> as User Friendly Realm
              Admin Links
            </p>
            <ul>
              <li>
                <p>
                  <code
                    ><a href="${generateRealmLinksByEnv('dev', realmName)}"
                      >${generateRealmLinksByEnv('dev', realmName)}</a
                    ></code
                  >
                </p>
              </li>
              <li>
                <p>
                  <code
                    ><a href="${generateRealmLinksByEnv('test', realmName)}"
                      >${generateRealmLinksByEnv('test', realmName)}</a
                    ></code
                  >
                </p>
              </li>
              <li>
                <p>
                  <code
                    ><a href="${generateRealmLinksByEnv('prod', realmName)}"
                      >${generateRealmLinksByEnv('prod', realmName)}</a
                    ></code
                  >
                </p>
              </li>
            </ul>
          </li>
        </ol>
        <p>
          If you have any questions or require further assistance, feel free to reach out to us by Rocket.Chat or email at:
          <a href="mailto:bcgov.sso@gov.bc.ca">bcgov.sso@gov.bc.ca</a>
        </p>
        ${emailFooter}
        `,
    subject: `${subjectPrefix}Important: Custom Realm ${realm.realm} contact information has been updated. Action required to Onboard New Realm Admin.`,
  });
};

export const offboardRealmAdmin = async (session: Session, realm: Roster, oldContact: string, contactType: string) => {
  const nonUpdatedTeamMemberEmail = contactType.startsWith('Product')
    ? realm.technicalContactEmail
    : realm.productOwnerEmail;
  const username = `${session.user.given_name} ${session.user.family_name}`;
  const to = [oldContact!, nonUpdatedTeamMemberEmail!].filter((email) => email);
  if (!to.length) return;
  return await sendEmail({
    to,
    cc: [ssoTeamEmail],
    body: `
        ${emailHeader}
        <p>
          We're reaching out to update you on changes to the ${contactType} details within the ${
      realm.realm
    } Custom realm. As of
          ${new Date().toLocaleDateString()}, ${username} has modified the contact information in the Realm Registry, replacing ${oldContact} with the
          updated information for the ${realm.realm}. We want to ensure you're informed about these recent updates.
        </p>
        <p>Please follow instructions below to remove ${oldContact} as the Realm Admin</p>
        <strong>Offboarding instructions to remove an existing realm admin</strong>
        <ol type="a">
          <li>
            <p>We recommend deleting the offboarded team member from your custom realm. See image below.</p>
            <img src="${sso_logout_redirect_uri}/offboard-realm-admin.png" alt="OffBoardRealmAdmin" style="width:650px">
          </li>
          <li>
            <p>As you and your realm admins may have configured the user to a realm level role or realm level group, please remove the user accordingly.</p>
          </li>
        </ol>
        <p>
          If you have any questions or require further assistance, feel free to reach out to us by Rocket.Chat or email at:
          <a href="mailto:bcgov.sso@gov.bc.ca">bcgov.sso@gov.bc.ca</a>
        </p>
        ${emailFooter}
        `,
    subject: `${subjectPrefix}Important: Custom Realm ${realm.realm} contact information has been updated. Action required to Offboard existing Realm Admin.`,
  });
};
