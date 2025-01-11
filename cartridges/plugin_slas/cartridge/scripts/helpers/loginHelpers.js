'use strict';

var BasketMgr = require('dw/order/BasketMgr');

var config = require('*/cartridge/scripts/config/SLASConfig');
var slasAuthHelper = require('*/cartridge/scripts/helpers/slasAuthHelper');
var cartMergeService = require('*/cartridge/scripts/services/CartMergeService');

var Logger = require('dw/system/Logger');
var log = Logger.getLogger('plugin_slas', 'plugin_slas.account');

// Enum implementation to specify login error reason if known.
const ENUM_LOGIN_ERROR = Object.freeze({
    INVALID_CREDENTIALS: 0,
    AUTH_SERVICE_FAILURE: 1,
    UNKNOWN_ERROR: 2
});
/**
 * Handles registered user login via SLAS
 * @param {Object} parameters - object cointaining properties required to build request object.
 * @property {string} parameters.username - username of the shopper.
 * @property {string} parameters.password - password of the shopper.
 * @property {boolean} parameters.isRememberMeChecked - boolean value used to set refresh_token to cookies to retain logged-in session.
 * @property {string} parameters.ipAddress - remoteAddress from the origin of the request.
 * @property {Object} parameters.responseObj - res.base object received from server middleware when SLAS is triggered from Login Page to set or remove SLAS tokens and cookies.
 * We made an exception about not passing down the response object entirely down the call stack to minimize diversion from base implementation of SFRA controllers.
 */
function loginShopper(parameters) {
    var cookiesToRemove = [config.REFRESH_TOKEN_COOKIE_NAME_GUEST];

    var usidCookie = slasAuthHelper.getCookie(config.USID_COOKIE_NAME);

    var options = {
        username: parameters.username,
        password: parameters.password
    };

    var guestRefreshTokenCookie = slasAuthHelper.getCookie(
        config.REFRESH_TOKEN_COOKIE_NAME_GUEST
    );

    if (usidCookie && usidCookie.value) {
        options.usid = usidCookie.value;
    } else if (guestRefreshTokenCookie && guestRefreshTokenCookie.value) {
        var refreshTokenLogin =
            slasAuthHelper.getSLASAccessTokenForRefreshLogin(
                guestRefreshTokenCookie.value
            );
        options.usid = refreshTokenLogin.usid;
    }

    var tokenData =
        slasAuthHelper.getSLASAccessTokenForRegisteredShoppers(options);

    var ocapiSessionBridgeCookies = slasAuthHelper.getOCAPISessionBridgeCookies(
        tokenData.access_token,
        parameters.ipAddress
    );

    if (BasketMgr.getCurrentBasket() && options.usid) {
        cartMergeService.mergeBasket(tokenData.access_token);
    }

    var cookiesToSet = ocapiSessionBridgeCookies;
    if (config.SAVE_REFRESH_TOKEN_ALWAYS || parameters.isRememberMeChecked) {
        cookiesToSet[config.REFRESH_TOKEN_COOKIE_NAME_REGISTERED] = {
            value: tokenData.refresh_token,
            maxAge: tokenData.refresh_token_expires_in
        };
    }

    cookiesToSet[config.SESSION_GUARD_COOKIE_NAME] = {
        value: 1,
        maxAge: config.SESSION_GUARD_COOKIE_AGE
    };

    cookiesToSet[config.ACCESS_TOKEN_COOKIE_NAME] = {
        value: tokenData.access_token,
        maxAge: config.ACCESS_TOKEN_COOKIE_AGE
    };

    slasAuthHelper.setCookiesToResponse(cookiesToSet, parameters.responseObj);

    cookiesToRemove.forEach(function (cookie) {
        slasAuthHelper.removeCookie(cookie, parameters.responseObj);
    });
}

/**
 * Handle an error from the login form
 * @param {string} e the error object
 * @returns {number} Corresponding enum value from ENUM_LOGIN_ERROR
 */
function parseLoginError(e) {
    var error = {};
    try {
        // Errors generated by SLAS plugin can be parsed as JSON. If the error message is not a JSON,
        // the error message did not originate from plugin execution (ie. it could be a syntax error)
        // TODO: Create a custom SLAS plugin error type
        error = JSON.parse(e.message);
    } catch (jsonParseError) {
        log.error(e.message);
        return ENUM_LOGIN_ERROR.UNKNOWN_ERROR;
    }
    // In SLAS, most user credential errors will result in HTTP 401.
    // However, if a user rapidly logs in multiple times with incorrect
    // credentials, SLAS may retrn an HTTP 409 instead.
    var isUserInputError =
        error.type === 'HTTP' && (error.status === 401 || error.status === 409);
    if (isUserInputError) {
        return ENUM_LOGIN_ERROR.INVALID_CREDENTIALS;
    }
    log.error(e.message);
    return ENUM_LOGIN_ERROR.AUTH_SERVICE_FAILURE;
}

module.exports = {
    loginShopper: loginShopper,
    ENUM_LOGIN_ERROR: ENUM_LOGIN_ERROR,
    parseLoginError: parseLoginError
};
