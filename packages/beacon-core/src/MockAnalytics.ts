import { AnalyticsInterface } from '@tezos-x/beacon-types'

export class MockAnalytics implements AnalyticsInterface {
  track(
    _trigger: 'click' | 'event',
    _section: string,
    _label: string,
    _data?: Record<string, any>
  ) {
    // console.log('##### TRACK', trigger, section, label, data)
    // noop
  }
}
