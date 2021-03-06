describe('DownloadUrl service', function() {

  'use strict';

  var service,
      Language = sinon.stub(),
      GenerateLuceneQuery = sinon.stub();

  beforeEach(function() {
    module('inboxApp');
    module(function($provide) {
      $provide.value('Language', Language);
      $provide.value('GenerateLuceneQuery', GenerateLuceneQuery);
      $provide.value('$q', Q); // bypass $q so we don't have to digest
    });
    inject(function(_DownloadUrl_) {
      service = _DownloadUrl_;
    });
  });

  afterEach(function() {
    KarmaUtils.restore(Language, GenerateLuceneQuery);
  });

  it('builds url for messages', function() {
    Language.returns(Promise.resolve('en'));
    return service(null, 'messages').then(function(actual) {
      chai.expect(actual).to.equal('/api/v1/export/messages?format=xml&locale=en');
    });
  });

  it('builds url for audit', function() {
    Language.returns(Promise.resolve('en'));
    return service(null, 'audit').then(function(actual) {
      chai.expect(actual).to.equal('/api/v1/export/audit?format=xml&locale=en');
    });
  });

  it('builds url for feedback', function() {
    Language.returns(Promise.resolve('en'));
    return service(null, 'feedback').then(function(actual) {
      chai.expect(actual).to.equal('/api/v1/export/feedback?format=xml&locale=en');
    });
  });

  it('builds url for logs', function() {
    Language.returns(Promise.resolve('en'));
    return service(null, 'logs').then(function(actual) {
      chai.expect(actual).to.equal('/api/v1/export/logs?format=zip&locale=en');
    });
  });

  describe('urls for reports', function() {
    it('builds base url', function() {
      Language.returns(Promise.resolve('en'));
      GenerateLuceneQuery.returns({ query: 'form:P' });
      return service(null, 'reports').then(function(actual) {
        chai.expect(decodeURIComponent(actual))
            .to.equal('/api/v2/export/reports');

        // We no longer use translate or use lucence
        chai.expect(Language.callCount).to.equal(0);
        chai.expect(GenerateLuceneQuery.callCount).to.equal(0);
      });
    });
    it('attaches filter object as params', function() {
      return service({forms: {selected: [{code: 'foo-form'}]}}, 'reports').then(function(actual) {
        chai.expect(decodeURIComponent(actual)).to.equal(
          '/api/v2/export/reports?filters[forms][selected][0][code]=foo-form'
        );
      });
    });
  });

  it('builds url for contacts backup', function() {
    Language.returns(Promise.resolve('en'));
    GenerateLuceneQuery.returns({ query: 'district:2' });
    return service(null, 'contacts').then(function(actual) {
      chai.expect(decodeURIComponent(actual))
          .to.equal('/api/v1/export/contacts?format=json&locale=en&query="district:2"&schema=');
    });
  });

  it('errors for unknown type', function(done) {
    service(null, 'unknown')
      .then(function() {
        done(new Error('expected error to be thrown'));
      })
      .catch(function(err) {
        chai.expect(err.message).to.equal('Unknown download type');
        done();
      });
  });

});
