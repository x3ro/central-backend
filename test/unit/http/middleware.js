const should = require('should');
const { createRequest, createResponse } = require('node-mocks-http');

const appRoot = require('app-root-path');
const middleware = require(appRoot + '/lib/http/middleware');
const Problem = require(appRoot + '/lib/util/problem');
const Option = require(appRoot + '/lib/util/option');
const { hashPassword } = require(appRoot + '/lib/util/crypto');

describe('middleware', () => {
  describe('versionParser', () => {
    const { versionParser } = middleware;
    it('should fallthrough to the error handler if no version is present', (done) => {
      const request = createRequest({ url: '/hello/test/v1' });
      versionParser(request, null, (error) => {
        error.isProblem.should.equal(true);
        error.problemCode.should.equal(404.2);
        done();
      });
    });

    it('should fallthrough to the error handler if the version is wrong', (done) => {
      const request = createRequest({ url: '/v4/users' });
      versionParser(request, null, (error) => {
        error.isProblem.should.equal(true);
        error.problemCode.should.equal(404.3);
        error.problemDetails.got.should.equal('4');
        done();
      });
    });

    it('should strip off the version before calling next', (done) => {
      const request = createRequest({ url: '/v1/users/23' });
      versionParser(request, null, () => {
        request.url.should.equal('/users/23');
        done();
      });
    });

    it('should supply a numeric representation of the received number under request', (done) => {
      const request = createRequest({ url: '/v1/forms/testform/submissions' });
      versionParser(request, null, () => {
        request.apiVersion.should.equal(1);
        done();
      });
    });
  });

  describe('fieldKeyParser', () => {
    const { fieldKeyParser } = middleware;
    it('should always set request.fieldKey None if nothing is given', (done) => {
      const request = createRequest({ url: '/users/23' });
      fieldKeyParser(request, null, () => {
        request.fieldKey.should.equal(Option.none());
        done();
      });
    });

    it('should set None and leave the URL if the prefix key is invalid', (done) => {
      const request = createRequest({ url: '/key/12345/users/23' });
      fieldKeyParser(request, null, () => {
        request.fieldKey.should.equal(Option.none());
        request.url.should.equal('/key/12345/users/23');
        done();
      });
    });

    it('should set Some(fk) and rewrite URL if a prefix key is found', (done) => {
      const request = createRequest({ url: '/key/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/users/23' });
      fieldKeyParser(request, null, () => {
        request.fieldKey.should.eql(Option.of('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
        request.url.should.equal('/users/23');
        done();
      });
    });

    it('should decode percent-encoded prefix keys', (done) => {
      const request = createRequest({ url: '/key/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%24aa!aaaaaaaaaaaaaaaaaa/users/23' });
      fieldKeyParser(request, null, () => {
        request.fieldKey.should.eql(Option.of('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$aa!aaaaaaaaaaaaaaaaaa'));
        request.url.should.equal('/users/23');
        done();
      });
    });

    it('should set None and leave the URL if the query key is invalid', (done) => {
      const request = createRequest({ url: '/users/23?authorization=inva|id' });
      fieldKeyParser(request, null, () => {
        request.fieldKey.should.equal(Option.none());
        done();
      });
    });

    it('should set Some(fk) and rewrite URL if a query key is found', (done) => {
      const request = createRequest({ url: '/users/23?authorization=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
      fieldKeyParser(request, null, () => {
        request.fieldKey.should.eql(Option.of('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
        done();
      });
    });

    it('should decode percent-encoded query keys', (done) => {
      const request = createRequest({ url: '/users/23?authorization=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%24aa!aaaaaaaaaaaaaaaaaa' });
      fieldKeyParser(request, null, () => {
        request.fieldKey.should.eql(Option.of('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$aa!aaaaaaaaaaaaaaaaaa'));
        done();
      });
    });
  });
});

