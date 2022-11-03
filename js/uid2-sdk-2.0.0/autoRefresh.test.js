const sdk = require('../../static/js/uid2-sdk-2.0.0.js');
const mocks = require('../mocks.js');

let callback;
let uid2;
let xhrMock;
let cryptoMock;

mocks.setupFakeTime();

beforeEach(() => {
  callback = jest.fn();
  uid2 = new sdk.UID2();
  xhrMock = new mocks.XhrMock(sdk.window);
  cryptoMock = new mocks.CryptoMock(sdk.window);
  mocks.setCookieMock(sdk.window.document);
});

afterEach(() => {
  mocks.resetFakeTime();
});

const getUid2Cookie = mocks.getUid2Cookie;
const makeIdentity = mocks.makeIdentityV2;

describe('when auto refreshing a non-expired identity which does not require a refresh', () => {
  beforeEach(() => {
    uid2.init({ callback: callback, identity: makeIdentity() });
    jest.clearAllMocks();
    jest.runOnlyPendingTimers();
  });

  it('should not invoke the callback', () => {
    expect(callback).not.toHaveBeenCalled();
  });
  it('should not initiate token refresh', () => {
    expect(xhrMock.send).not.toHaveBeenCalled();
  });
  it('should set refresh timer', () => {
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(clearTimeout).not.toHaveBeenCalled();
  });
  it('should be in available state', () => {
    expect(uid2).toBeInAvailableState();
  });
});

describe('when auto refreshing a non-expired identity which requires a refresh', () => {
  const refreshFrom = Date.now() + 100;
  const originalIdentity = makeIdentity({
    advertising_token: 'original_advertising_token',
    refresh_from: refreshFrom
  });
  const updatedIdentity = makeIdentity({
    advertising_token: 'updated_advertising_token'
  });

  beforeEach(() => {
    uid2.init({ callback: callback, identity: originalIdentity });
    jest.clearAllMocks();
    jest.setSystemTime(refreshFrom);
    jest.runOnlyPendingTimers();
  });

  it('should not invoke the callback', () => {
    expect(callback).not.toHaveBeenCalled();
  });
  it('should initiate token refresh', () => {
    expect(xhrMock.send).toHaveBeenCalledTimes(1);
  });
  it('should not set refresh timer', () => {
    expect(setTimeout).not.toHaveBeenCalled();
    expect(clearTimeout).not.toHaveBeenCalled();
  });
  it('should be in available state', () => {
    expect(uid2).toBeInAvailableState();
  });

  describe('when token refresh succeeds', () => {
    beforeEach(() => {
      xhrMock.responseText = btoa(JSON.stringify({ status: 'success', body: updatedIdentity }));
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: updatedIdentity.advertising_token,
        advertising_token: updatedIdentity.advertising_token,
        status: sdk.UID2.IdentityStatus.REFRESHED,
      }));
    });
    it('should set cookie', () => {
      expect(getUid2Cookie().advertising_token).toBe(updatedIdentity.advertising_token);
    });
    it('should set refresh timer', () => {
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(clearTimeout).not.toHaveBeenCalled();
    });
    it('should be in available state', () => {
      expect(uid2).toBeInAvailableState(updatedIdentity.advertising_token);
    });
  });

  describe('when token refresh returns optout', () => {
    beforeEach(() => {
      xhrMock.responseText = btoa(JSON.stringify({ status: 'optout' }));
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: undefined,
        advertising_token: undefined,
        status: sdk.UID2.IdentityStatus.OPTOUT,
      }));
    });
    it('should clear cookie', () => {
      expect(getUid2Cookie()).toBeUndefined();
    });
    it('should not set refresh timer', () => {
      expect(setTimeout).not.toHaveBeenCalled();
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });
    it('should be in unavailable state', () => {
      expect(uid2).toBeInUnavailableState();
    });
  });

  describe('when token refresh returns refresh token expired', () => {
    beforeEach(() => {
      xhrMock.responseText = btoa(JSON.stringify({ status: 'expired_token' }));
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: undefined,
        advertising_token: undefined,
        status: sdk.UID2.IdentityStatus.REFRESH_EXPIRED,
      }));
    });
    it('should clear cookie', () => {
      expect(getUid2Cookie()).toBeUndefined();
    });
    it('should not set refresh timer', () => {
      expect(setTimeout).not.toHaveBeenCalled();
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });
    it('should be in unavailable state', () => {
      expect(uid2).toBeInUnavailableState();
    });
  });

  describe('when token refresh returns an error status', () => {
    beforeEach(() => {
      xhrMock.responseText = JSON.stringify({ status: 'error', body: updatedIdentity });
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should not invoke the callback', () => {
      expect(callback).not.toHaveBeenCalled();
    });
    it('should not update cookie', () => {
      expect(getUid2Cookie().advertising_token).toBe(originalIdentity.advertising_token);
    });
    it('should set refresh timer', () => {
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(clearTimeout).not.toHaveBeenCalled();
    });
    it('should be in available state', () => {
      expect(uid2).toBeInAvailableState(originalIdentity.advertising_token);
    });
  });

  describe('when token refresh fails and current identity expires', () => {
    beforeEach(() => {
      jest.setSystemTime(originalIdentity.refresh_expires * 1000 + 1);
      xhrMock.responseText = JSON.stringify({ status: 'error' });
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: undefined,
        advertising_token: undefined,
        status: sdk.UID2.IdentityStatus.REFRESH_EXPIRED,
      }));
    });
    it('should clear cookie', () => {
      expect(getUid2Cookie()).toBeUndefined();
    });
    it('should not set refresh timer', () => {
      expect(setTimeout).not.toHaveBeenCalled();
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });
    it('should be in unavailable state', () => {
      expect(uid2).toBeInUnavailableState();
    });
  });
});

describe('when auto refreshing an expired identity', () => {
  const refreshFrom = Date.now() + 100;
  const originalIdentity = makeIdentity({
    advertising_token: 'original_advertising_token',
    identity_expires: refreshFrom,
    refresh_from: refreshFrom
  });
  const updatedIdentity = makeIdentity({
    advertising_token: 'updated_advertising_token'
  });

  beforeEach(() => {
    uid2.init({ callback: callback, identity: originalIdentity });
    jest.clearAllMocks();
    jest.setSystemTime(refreshFrom);
    jest.runOnlyPendingTimers();
  });

  it('should not invoke the callback', () => {
    expect(callback).not.toHaveBeenCalled();
  });
  it('should initiate token refresh', () => {
    expect(xhrMock.send).toHaveBeenCalledTimes(1);
  });
  it('should not set refresh timer', () => {
    expect(setTimeout).not.toHaveBeenCalled();
    expect(clearTimeout).not.toHaveBeenCalled();
  });
  it('should be in available state', () => {
    expect(uid2).toBeInAvailableState();
  });

  describe('when token refresh succeeds', () => {
    beforeEach(() => {
    xhrMock.responseText = btoa(JSON.stringify({ status: 'success', body: updatedIdentity }));
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: updatedIdentity.advertising_token,
        advertising_token: updatedIdentity.advertising_token,
        status: sdk.UID2.IdentityStatus.REFRESHED,
      }));
    });
    it('should set cookie', () => {
      expect(getUid2Cookie().advertising_token).toBe(updatedIdentity.advertising_token);
    });
    it('should set refresh timer', () => {
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(clearTimeout).not.toHaveBeenCalled();
    });
    it('should be in available state', () => {
      expect(uid2).toBeInAvailableState(updatedIdentity.advertising_token);
    });
  });

  describe('when token refresh returns optout', () => {
    beforeEach(() => {
      xhrMock.responseText = btoa(JSON.stringify({ status: 'optout' }));
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: undefined,
        advertising_token: undefined,
        status: sdk.UID2.IdentityStatus.OPTOUT,
      }));
    });
    it('should clear cookie', () => {
      expect(getUid2Cookie()).toBeUndefined();
    });
    it('should not set refresh timer', () => {
      expect(setTimeout).not.toHaveBeenCalled();
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });
    it('should be in unavailable state', () => {
      expect(uid2).toBeInUnavailableState();
    });
  });

  describe('when token refresh returns refresh token expired', () => {
    beforeEach(() => {
      xhrMock.responseText = btoa(JSON.stringify({ status: 'expired_token' }));
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: undefined,
        advertising_token: undefined,
        status: sdk.UID2.IdentityStatus.REFRESH_EXPIRED,
      }));
    });
    it('should clear cookie', () => {
      expect(getUid2Cookie()).toBeUndefined();
    });
    it('should not set refresh timer', () => {
      expect(setTimeout).not.toHaveBeenCalled();
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });
    it('should be in unavailable state', () => {
      expect(uid2).toBeInUnavailableState();
    });
  });

  describe('when token refresh returns an error status', () => {
    beforeEach(() => {
      xhrMock.responseText = JSON.stringify({ status: 'error', body: updatedIdentity });
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: undefined,
        advertising_token: undefined,
        status: sdk.UID2.IdentityStatus.EXPIRED,
      }));
    });
    it('should not update cookie', () => {
      expect(getUid2Cookie().advertising_token).toBe(originalIdentity.advertising_token);
    });
    it('should set refresh timer', () => {
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(clearTimeout).not.toHaveBeenCalled();
    });
    it('should be in temporarily unavailable state', () => {
      expect(uid2).toBeInTemporarilyUnavailableState(originalIdentity.advertising_token);
    });
  });

  describe('when token refresh fails and current identity expires', () => {
    beforeEach(() => {
      jest.setSystemTime(originalIdentity.refresh_expires * 1000 + 1);
      xhrMock.responseText = JSON.stringify({ status: 'error' });
      xhrMock.onreadystatechange(new Event(''));
    });

    it('should invoke the callback', () => {
      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
        advertisingToken: undefined,
        advertising_token: undefined,
        status: sdk.UID2.IdentityStatus.REFRESH_EXPIRED,
      }));
    });
    it('should clear cookie', () => {
      expect(getUid2Cookie()).toBeUndefined();
    });
    it('should not set refresh timer', () => {
      expect(setTimeout).not.toHaveBeenCalled();
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });
    it('should be in unavailable state', () => {
      expect(uid2).toBeInUnavailableState();
    });
  });
});
