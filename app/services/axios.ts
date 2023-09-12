import axios from 'axios';
import store2 from 'store2';

const instance = axios.create({
  baseURL: `/api/`,
  timeout: 0,
  withCredentials: true,
});

instance?.interceptors.request.use(
  async function (config) {
    return { ...config, headers: { ...config.headers } };
  },
  function (error) {
    return Promise.reject(error);
  },
);

instance?.interceptors.response.use(
  function (response) {
    return response;
  },
  function (error) {
    if (error.response.status === 401) {
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }

    return Promise.reject(error);
  },
);

export { instance };
