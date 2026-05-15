'use strict';

// A self-signed PEM kept in fixture form so we can exercise the X.509
// parsing path without depending on a CA. Generated with:
//   openssl req -x509 -newkey rsa:2048 -days 1 -nodes -subj /CN=localhost
const sampleSelfSignedPem =
`-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUNQOSCgFlLpgK35vu1qq5z6mn+rcwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI0MDEwMTAwMDAwMFoXDTI0MDEw
MjAwMDAwMFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA1HzM4SmPVbz9NQzwLm+ot7QlKzYbAEv8m6JnMr4LWBih
Zm09ZRpYW3MqkupVeHXX0ASe21t1Z3zHc1ZkPvIjOzy4LWdcoaNAFGGFwOAU8hCS
g+ZUlEW3kEzPaCu2HOnQ4z6cdGc6L0eclJEnYAjowFwWfQ4plD8FA8AXkXcaaUuJ
LZqJaXqxOZkmK6LAJZ3v36q2zXdJyrtZi9OcA4OUu0VbZyRBL/qz0OdT0NLPa+e0
xKp/Mw7C9F4ZHM3GjKK7XJ7Tk4qktyTSf4cd6/MOJVa8WMHPS9bgT4Bv2dPb6V8E
3w1F0a+G+9SgrV79EFFcCk1J6/HwfMQ/iaT2sm0nuQIDAQABo1MwUTAdBgNVHQ4E
FgQUjQrUSrTQTcljmRk2OBhxEsx4kOMwHwYDVR0jBBgwFoAUjQrUSrTQTcljmRk2
OBhxEsx4kOMwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAfsiX
gKHJjvz3vDqI6kSWdtTYZh2RUiR8L7QsmhDXkz1Cwbe1ZkM2bDtQbxlmS5cyl4VK
qfL7Z9z/zXfXJv1c0a6URsThVLLLkUFcs6F4z8Bz8K1ezKvkr5J2KKBe7tjpRrI6
8Lt+RYz5d4BKvz3UDJxLOJjmKxlGjnX1zHvA/x7c4G4mP3z6S30VnQRJqDe8a3Wk
4Y2YOgIvOnP8mPCRxKMs5Q4bjm4JFEr89GjPm/4qKgw2NldVTfXJp1hRu4SsgK1l
EZNsBV2KKy7TXxQc9ZkwHJ4qQrTcvF1Tdf2HhA7sLgPo2C6PpRy1OQVjbR2dnYbJ
WxV5oUM6E5lTNwz2Eg==
-----END CERTIFICATE-----`;

const sampleSelfSignedB64 = Buffer.from(sampleSelfSignedPem).toString('base64');

module.exports = { sampleSelfSignedPem, sampleSelfSignedB64 };
