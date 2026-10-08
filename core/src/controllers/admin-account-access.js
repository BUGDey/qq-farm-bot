const {
  normalizeAccountRef,
  resolveAccountId,
} = require('../services/account-resolver');
const { isElevatedRole } = require('../config/user-system');

/** 账号归属字段：优先 owner，兼容旧数据使用 username */
function getAccountOwner(account) {
  if (!account) return '';
  const owner = String(account.owner || '').trim();
  return owner || String(account.username || '').trim();
}

/** 判断账号是否归属于该登录用户 */
function isAccountOwner(account, user) {
  if (!account || !user) return false;
  if (isElevatedRole(user.role)) return true;
  return getAccountOwner(account) === String(user.username || '').trim();
}

function createAdminAccountAccess({ store, getProvider }) {
  function getAccountsForUser(username = null) {
    try {
      const provider = typeof getProvider === 'function' ? getProvider() : null;
      if (provider && typeof provider.getAccounts === 'function') {
        const providerAccounts = provider.getAccounts();
        if (providerAccounts && Array.isArray(providerAccounts.accounts)) {
          if (username) {
            return providerAccounts.accounts.filter(
              account => account.username === username,
            );
          }
          return providerAccounts.accounts;
        }
      }
    } catch {}

    const emptyAccounts = {};
    emptyAccounts.accounts = [];
    const storedAccounts = store.getAccounts
      ? store.getAccounts()
      : emptyAccounts;
    let accounts = Array.isArray(storedAccounts.accounts)
      ? storedAccounts.accounts
      : [];
    if (username) {
      const target = String(username).trim();
      accounts = accounts.filter(account => getAccountOwner(account) === target);
    }
    return accounts;
  }

  function canAccessAccount(req, accountId) {
    const currentUser = req.currentUser;
    if (!currentUser) return false;
    if (isElevatedRole(currentUser.role)) return true;
    const targetId = String(accountId || '').trim();
    if (!targetId) return false;
    const accountList = getAccountsForUser();
    const account = accountList.find(item => String(item.id) === targetId);
    if (!account) return false;
    return isAccountOwner(account, currentUser);
  }

  function getAccessibleAccountIdsFromRequest(req) {
    const currentUser = req.currentUser;
    if (!currentUser) return [];
    const accountList = getAccountsForUser();
    if (isElevatedRole(currentUser.role)) {
      return accountList.map(account => account.id);
    }
    return accountList
      .filter(account => isAccountOwner(account, currentUser))
      .map(account => account.id);
  }

  function getAccessibleAccountIdsForUser(user) {
    if (!user) return [];
    const accountList = getAccountsForUser();
    if (isElevatedRole(user.role)) {
      return accountList.map(account => account.id);
    }
    return accountList
      .filter(account => isAccountOwner(account, user))
      .map(account => account.id);
  }

  function resolveAccountReference(ref) {
    const normalizedRef = normalizeAccountRef(ref);
    if (!normalizedRef) return '';
    const provider = typeof getProvider === 'function' ? getProvider() : null;
    if (provider && typeof provider.resolveAccountId === 'function') {
      const providerAccountId = normalizeAccountRef(
        provider.resolveAccountId(normalizedRef),
      );
      if (providerAccountId) return providerAccountId;
    }
    const accountId = resolveAccountId(getAccountsForUser(), normalizedRef);
    return accountId || normalizedRef;
  }

  function getAccountIdFromRequest(req) {
    return resolveAccountReference(req.headers['x-account-id']);
  }

  return {
    canAccessAccount,
    getAccessibleAccountIdsForUser,
    getAccessibleAccountIdsFromRequest,
    getAccountIdFromRequest,
    getAccountsForUser,
    isAccountOwner,
    resolveAccountReference,
  };
}

module.exports = {
  createAdminAccountAccess,
  getAccountOwner,
  isAccountOwner,
};
