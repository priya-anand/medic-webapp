const sinon = require('sinon').sandbox.create();
const auth = require('../../../auth');
require('chai').should();
const controller = require('../../../controllers/bulk-docs');

const testReq = {
  body: {
    docs: []
  }
};
const testRes = {};

describe('Bulk Docs controller', () => {
  beforeEach(() => {
    sinon.stub(auth, 'getUserCtx');
    sinon.stub(auth, 'isAdmin');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('checks that user is an admin', () => {
    const userCtx = {};
    auth.getUserCtx.resolves(userCtx);
    auth.isAdmin.withArgs(userCtx).returns(false);
    const next = sinon.stub();
    return controller.bulkDelete(testReq, testRes, next)
      .then(() => {
        auth.getUserCtx.callCount.should.equal(1);
        auth.isAdmin.callCount.should.equal(1);
        next.callCount.should.equal(1);
        next.getCall(0).args[0].code.should.equal(401);
      });
  });
});
