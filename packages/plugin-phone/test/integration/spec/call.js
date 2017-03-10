/**!
 *
 * Copyright (c) 2015-2016 Cisco Systems, Inc. See LICENSE file.
 */

import '../..';

import {assert} from '@ciscospark/test-helper-chai';
import sinon from '@ciscospark/test-helper-sinon';
import CiscoSpark from '@ciscospark/spark-core';
import testUsers from '@ciscospark/test-helper-test-users';
import handleErrorEvent from '../lib/handle-error-event';

describe(`plugin-phone`, function() {
  this.timeout(30000);

  describe(`Call`, () => {
    /* eslint max-statements: [0] */
    let mccoy, spock;
    before(() => testUsers.create({count: 2})
      .then((users) => {
        [mccoy, spock] = users;
        spock.spark = new CiscoSpark({
          credentials: {
            authorization: spock.token
          }
        });

        mccoy.spark = new CiscoSpark({
          credentials: {
            authorization: mccoy.token
          }
        });

        return Promise.all([
          spock.spark.phone.register(),
          mccoy.spark.phone.register()
        ]);
      }));

    after(() => Promise.all([
      spock && spock.spark.phone.deregister()
        .catch((reason) => console.warn(`could not disconnect spock from mercury`, reason)),
      mccoy && mccoy.spark.phone.deregister()
        .catch((reason) => console.warn(`could not disconnect mccoy from mercury`, reason))
    ]));

    describe(`#id`, () => {
      it(`identifies the local party's leg of the call`);
    });

    describe(`#sessionId`, () => {
      // This is the locus sessionId which is not currently available at call
      // start
      it(`identifies the call`);
    });

    describe(`#status`, () => {
      let call;
      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      describe(`when the remote party has not yet joined`, () => {
        // Running this test puts spock in a weird state because hangup doesn't
        // quite work
        it(`is "initiated"`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.status, `initiated`);
          return handleErrorEvent(call, () => call.hangup());
        });
      });

      describe(`when the remote party has acknowledged the call`, () => {
        it(`is "ringing"`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.status, `initiated`);
          return handleErrorEvent(call, () => mccoy.spark.phone.when(`call:incoming`)
            .then(([c]) => Promise.all([
              c.acknowledge(),
              call.when(`ringing`)
                .then(() => assert.equal(call.status, `ringing`))
            ])));
        });
      });

      describe(`when the receiving party joins the call`, () => {
        it(`is "connected"`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.status, `initiated`);
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
          ]));
        });
      });

      describe(`when the local party has left the call`, () => {
        // TODO do we need states for local and remote decline?
        it(`is "disconnected"`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.status, `initiated`);
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => {
                assert.equal(call.status, `connected`);
                return call.hangup();
              }),
            call.when(`disconnected`)
              .then(() => assert.equal(call.status, `disconnected`))
          ]));
        });
      });

      describe(`when the remote party has left the call`, () => {
        // TODO do we need states for local and remote decline?
        it(`is "disconnected"`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.status, `initiated`);
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()
                .then(() => c.hangup())),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`)),
            call.when(`disconnected`)
              .then(() => assert.equal(call.status, `disconnected`))
          ]));
        });
      });

      describe(`when the receiving party has declined the call`, () => {
        it(`is "disconnected"`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.status, `initiated`);
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.reject()),
            call.when(`disconnected`)
              .then(() => assert.equal(call.status, `disconnected`))
          ]));
        });
      });
    });

    describe(`#to`, () => {
      let call;
      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      it(`represents the receiving party`, () => {
        call = spock.spark.phone.dial(mccoy.email);
        return handleErrorEvent(call, () => Promise.all([
          mccoy.spark.phone.when(`call:incoming`)
            .then(([c]) => c.answer()),
          call.when(`connected`)
            .then(() => {
              return assert.equal(call.to.person.email, mccoy.email);
            })
        ]));
      });
    });

    describe(`#from`, () => {
      let call;
      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      it(`represents the initiating party`, () => {
        call = spock.spark.phone.dial(mccoy.email);
        return handleErrorEvent(call, () => Promise.all([
          mccoy.spark.phone.when(`call:incoming`)
            .then(([c]) => c.answer()),
          call.when(`connected`)
            .then(() => {
              return assert.equal(call.from.person.email, spock.email);
            })
        ]));
      });
    });

    describe(`#direction`, () => {
      it(`indicates the initiating and receiving members of the call`, () => {
        const call = spock.spark.phone.dial(mccoy.email);
        assert.equal(call.direction, `out`);
        return handleErrorEvent(call, () => mccoy.spark.phone.when(`call:incoming`)
          .then(([c]) => {
            assert.equal(call.direction, `out`);
            assert.property(c, `locus`);
            assert.isDefined(c.locus);
            assert.property(c, `direction`);
            assert.isDefined(c.direction);
            assert.equal(c.direction, `in`);
          }));
      });
    });

    describe(`#remoteMediaStream`, () => {
      let call;
      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      describe(`before the call is connected`, () => {
        it(`is null`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.remoteMediaStream, null);
          return handleErrorEvent(call, () => mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()));
        });
      });

      describe(`after the call is connected`, () => {
        it(`is a media stream`, () => {
          call = spock.spark.phone.dial(mccoy.email);
          assert.equal(call.remoteMediaStream, null);
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            new Promise((resolve, reject) => {
              call.on(`connected`, () => {
                try {
                  assert.instanceOf(call.remoteMediaStream, MediaStream);
                  assert.isDefined(call.remoteMediaStreamUrl);
                  resolve();
                }
                catch (err) {
                  reject(err);
                }
              });
            })
          ]));
        });
      });
    });

    describe(`#localMediaStream`, () => {
      describe(`when it is replaced mid-call`, () => {
        it(`triggers a renegotiation`);
      });
    });

    describe(`#sendingAudio`, () => {
      let call;
      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      describe(`when the local party is sending Audio`, () => {
        it(`is true`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {audio: true}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isTrue(call.sendingAudio))
          ]));
        });
      });

      describe(`when the local party is not sending Audio`, () => {
        it(`is false`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {audio: false}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isFalse(call.sendingAudio))
          ]));
        });
      });
    });

    describe(`#sendingVideo`, () => {
      let call;

      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      describe(`when the local party is sending Video`, () => {
        it(`is true`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {video: true}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isTrue(call.sendingVideo))
          ]));
        });
      });

      describe(`when the local party is not sending Video`, () => {
        it(`is false`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {video: false}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isFalse(call.sendingVideo))
          ]));
        });
      });
    });

    describe(`#receivingAudio`, () => {
      let call;

      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      describe(`when the local party is receiving Audio`, () => {
        it(`is true`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {audio: true}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isTrue(call.receivingAudio))
          ]));
        });
      });

      describe(`when the local party is not receiving Audio`, () => {
        it(`is false`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {audio: false}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isFalse(call.receivingAudio))
          ]));
        });
      });
    });

    describe(`#receivingVideo`, () => {
      let call;
      beforeEach(() => {
        call = spock.spark.phone.dial(mccoy.email);
        return handleErrorEvent(call, () => Promise.all([
          mccoy.spark.phone.when(`call:incoming`)
            .then(([c]) => c.answer()),
          call.when(`connected`)
            .then(() => assert.equal(call.status, `connected`))
        ]));
      });

      afterEach(() => {
        const c = call;
        call = undefined;
        return c.hangup().catch((reason) => console.warn(reason));
      });

      describe(`when the local party is receiving Video`, () => {
        it(`is true`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {video: true}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isTrue(call.receivingVideo))
          ]));
        });
      });

      describe(`when the local party is not receiving Video`, () => {
        it(`is false`, () => {
          call = spock.spark.phone.dial(mccoy.email, {constraints: {video: false}});
          return handleErrorEvent(call, () => Promise.all([
            mccoy.spark.phone.when(`call:incoming`)
              .then(([c]) => c.answer()),
            call.when(`connected`)
              .then(() => assert.equal(call.status, `connected`))
              .then(() => assert.isFalse(call.receivingVideo))
          ]));
        });
      });
    });

    describe(`#facingMode`, () => {
      describe(`when using the out-facing camera`, () => {
        it(`is "environment"`);
      });

      describe(`when using the user-facing camera`, () => {
        it(`is "user"`);
      });
    });

    describe(`#answer()`, () => {
      it(`accepts an incoming call`, () => {
        const call = mccoy.spark.phone.dial(spock.email);
        return handleErrorEvent(call, () => Promise.all([
          spock.spark.phone.when(`call:incoming`)
            .then(([c]) => c.answer()),
          call.when(`connected`)
            .then(() => assert.equal(call.status, `connected`))
        ]));
      });
      it(`reconnects to an in-progress call (e.g. in event of media disconnect due to page reload)`);
      it(`is a noop for outbound calls`);
      it(`is a noop for answered calls`);
    });

    describe(`#hangup()`, () => {
      let call;
      let remoteCall;
      beforeEach(() => {
        call = spock.spark.phone.dial(mccoy.email);
        return handleErrorEvent(call, () => Promise.all([
          mccoy.spark.phone.when(`call:incoming`)
            .then(([c]) => {
              remoteCall = c;
              c.answer();
            }),
          call.when(`connected`)
            .then(() => assert.equal(call.status, `connected`))
        ]));
      });

      it(`ends an in-progress call`, () => {
        call.hangup();
        return call.when(`disconnected`)
          .then(() => assert.equal(call.status, `disconnected`));
      });

      it(`gets called when the local party is the last member of the call`, () => {
        const hangupSpy = sinon.spy(call, `hangup`);
        remoteCall.hangup();
        return call.when(`disconnected`)
          .then(() => assert.called(hangupSpy));
      });

      it(`gets called when the local becomes inactive`);
      describe(`when the local party has not yet answered`, () => {
        it(`proxies to #reject()`);
      });
    });

    describe(`#reject()`, () => {
      let call;
      beforeEach(() => {
        call = spock.spark.phone.dial(mccoy.email);
      });

      it(`declines an incoming call`, () => {
        return handleErrorEvent(call, () => Promise.all([
          mccoy.spark.phone.when(`call:incoming`)
            .then(([c]) => {
              c.reject();
            }),
          call.when(`disconnected`)
            .then(() => assert.equal(call.status, `disconnected`))
        ]));
      });
      it(`is a noop for outbound calls`);
      it(`is a noop if answered calls`);
    });

    describe(`#toggleFacingMode`, () => {
      describe(`when the facing mode is "user"`, () => {
        it(`changes the facing mode to "environment"`);
      });

      describe(`when the facing mode is "environment"`, () => {
        it(`changes the facing mode to "user"`);
      });
    });

    describe(`triggered events`, () => {
      describe(`connection events`, () => {
        let call;
        let triggerSpy;
        beforeEach(() => {
          call = spock.spark.phone.dial(mccoy.email);
          triggerSpy = sinon.spy(call, `trigger`);
          assert.equal(call.status, `initiated`);
        });

        describe(`on(ringing)`, () => {
          it(`gets triggered when the remote party acknowledges the call`, () => {
            return handleErrorEvent(call, () => Promise.all([
              mccoy.spark.phone.when(`call:incoming`)
                .then(([c]) => {
                  c.acknowledge();
                  c.answer();
                }),
              call.when(`ringing`)
                .then(() => assert.calledWith(triggerSpy, `ringing`)),
              call.when(`connected`)
                .then(() => call.hangup())
            ]));
          });
        });

        describe(`on(connected)`, () => {
          it(`gets triggered when the call is connected`, () => {
            return handleErrorEvent(call, () => Promise.all([
              mccoy.spark.phone.when(`call:incoming`)
                .then(([c]) => {
                  c.acknowledge();
                  c.answer();
                }),
              call.when(`connected`)
                .then(() => assert.calledWith(triggerSpy, `connected`))
                .then(() => call.hangup())
            ]));
          });
        });

        describe(`on(disconnected)`, () => {
          it(`gets triggered when the call is disconnected`, () => {
            return handleErrorEvent(call, () => Promise.all([
              mccoy.spark.phone.when(`call:incoming`)
                .then(([c]) => {
                  c.acknowledge();
                  c.answer();
                }),
              call.when(`connected`)
                .then(() => call.hangup()),
              call.when(`disconnected`)
                .then(() => assert.calledWith(triggerSpy, `disconnected`))
            ]));
          });
        });
      });
    });

    describe(`on(error)`, () => {
      it(`gets triggered when something fails in a non-promise-returning method`, () => {
        this.timeout(30000);
        const call = spock.spark.phone.dial(`no one`);

        const errorSpy = sinon.spy();
        call.on(`error`, errorSpy);
        return call.when(`error`)
          .then(() => assert.called(errorSpy));
      });
    });
  });
});
