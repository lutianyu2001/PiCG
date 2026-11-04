import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIcon } from '@angular/material/icon'
import { MatProgressBar } from '@angular/material/progress-bar'
import { MatTooltip } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { TranslatePipe } from '../core/i18n/i18n.service'
import { Notify } from '../core/notify.service'
import { R2Keys, accountOf, isBucketName } from '../r2/r2.client'
import { R2Check, normalizePublicUrl } from '../session/r2-check'
import { R2Bucket, SessionStore } from '../session/session.store'
import { SignOutDialog } from '../session/sign-out-dialog'
import { ConfirmData, ConfirmDialog } from '../shared/confirm-dialog'
import { FieldsData, FieldsDialog } from '../shared/fields-dialog'

const publicUrlField = (value = '') => ({
  label: 'login_r2.public_url',
  value,
  hint: 'login_r2.public_url_hint',
  placeholder: 'https://img.example.com',
  validate: (v: string) => (normalizePublicUrl(v) ? null : 'login_r2.fail.public_url')
})

/** The R2 account signed in with: its keys and buckets. Changes rerun the check. */
@Component({
  selector: 'pg-r2-account-section',
  imports: [MatButton, MatIcon, MatIconButton, MatProgressBar, MatTooltip, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-section.scss',
  template: `
    <section class="section">
      <h2>{{ 'settings.r2_account' | t }}</h2>
      @if (account(); as account) {
        <div class="row">
          <span class="label">{{ 'settings.r2_account_id' | t }}</span>
          <code>{{ accountId() }}</code>
        </div>
        <div class="row">
          <span class="label">{{ 'login_r2.access_key_id' | t }}</span>
          <code>{{ masked() }}</code>
          <button matButton [disabled]="busy()" (click)="replaceKeys()">
            {{ 'settings.replace_keys' | t }}
          </button>
        </div>

        <div class="stack">
          <span class="label muted">{{ 'settings.buckets' | t }}</span>
          <ul class="list">
            @for (bucket of account.buckets; track bucket.name) {
              <li>
                <span class="grow">
                  <strong>{{ bucket.name }}</strong>
                  <a [href]="bucket.publicUrl" target="_blank" rel="noopener" class="muted">{{
                    bucket.publicUrl
                  }}</a>
                </span>
                <button
                  matIconButton
                  [disabled]="busy()"
                  [matTooltip]="'settings.edit_public_url' | t"
                  [attr.aria-label]="'settings.edit_public_url' | t"
                  (click)="editPublicUrl(bucket)"
                >
                  <mat-icon svgIcon="edit" />
                </button>
                <button
                  matIconButton
                  [disabled]="busy() || account.buckets.length === 1"
                  [matTooltip]="'settings.remove_bucket' | t"
                  [attr.aria-label]="'settings.remove_bucket' | t"
                  (click)="removeBucket(bucket.name)"
                >
                  <mat-icon svgIcon="delete" />
                </button>
              </li>
            }
          </ul>
          <div>
            <button matButton [disabled]="busy()" (click)="addBucket()">
              <mat-icon svgIcon="add" />{{ 'settings.add_bucket' | t }}
            </button>
          </div>
          <p class="desc">{{ 'settings.buckets_note' | t }}</p>
        </div>
      }

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="row">
        <button matButton="outlined" (click)="signOut()">
          <mat-icon svgIcon="logout" />{{ 'account.sign_out' | t }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .grow {
      display: flex;
      flex-direction: column;
      min-width: 0;
      a {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  `
})
export class R2AccountSection {
  private readonly session = inject(SessionStore)
  private readonly check = inject(R2Check)
  private readonly dialog = inject(MatDialog)
  private readonly notify = inject(Notify)
  private readonly router = inject(Router)

  protected readonly account = this.session.r2
  protected readonly busy = signal(false)
  protected readonly accountId = computed(() => accountOf(this.account()?.endpoint ?? ''))
  protected readonly masked = computed(() => {
    const id = this.account()?.accessKeyId ?? ''
    return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : ''
  })

  /** Checks the keys against the buckets and stores both when they pass. */
  private async apply(keys: R2Keys, buckets: R2Bucket[]) {
    const account = this.account()
    if (!account) {
      return false
    }
    this.busy.set(true)
    try {
      const result = await this.check.check(account.endpoint, keys, buckets)
      if (!result.ok) {
        this.notify.error(`login_r2.fail.${result.reason}`, {
          bucket: result.bucket ?? '',
          status: String(result.status ?? '')
        })
        return false
      }
      if (
        keys.accessKeyId !== account.accessKeyId ||
        keys.secretAccessKey !== account.secretAccessKey
      ) {
        this.session.setKeys(keys)
      }
      this.session.setBuckets(buckets)
      return true
    } finally {
      this.busy.set(false)
    }
  }

  protected async replaceKeys() {
    const account = this.account()
    if (!account) {
      return
    }
    const data: FieldsData = {
      title: 'settings.replace_keys',
      fields: [
        { label: 'login_r2.access_key_id', hint: 'settings.replace_keys_hint' },
        { label: 'login_r2.secret_access_key', secret: true }
      ],
      confirm: 'settings.check_and_save'
    }
    const values = await firstValueFrom(this.dialog.open(FieldsDialog, { data }).afterClosed())
    if (!values) {
      return
    }
    const [accessKeyId, secretAccessKey] = values as string[]
    if (await this.apply({ accessKeyId, secretAccessKey }, account.buckets)) {
      this.notify.info('settings.keys_saved')
    }
  }

  protected async addBucket() {
    const account = this.account()
    if (!account) {
      return
    }
    const taken = account.buckets.map((b) => b.name)
    const data: FieldsData = {
      title: 'settings.add_bucket',
      fields: [
        {
          label: 'settings.bucket_name',
          hint: 'settings.add_bucket_hint',
          validate: (v) => {
            if (!isBucketName(v)) {
              return 'settings.bucket_invalid'
            }
            return taken.includes(v) ? 'settings.bucket_exists' : null
          }
        },
        publicUrlField()
      ],
      confirm: 'settings.check_and_save'
    }
    const values = await firstValueFrom(this.dialog.open(FieldsDialog, { data }).afterClosed())
    if (!values) {
      return
    }
    const [name, url] = values as string[]
    const bucket = { name, publicUrl: normalizePublicUrl(url)! }
    if (await this.apply(account, [...account.buckets, bucket])) {
      this.notify.info('settings.bucket_added', { bucket: name })
    }
  }

  protected async editPublicUrl(bucket: R2Bucket) {
    const account = this.account()
    if (!account) {
      return
    }
    const data: FieldsData = {
      title: 'settings.edit_public_url',
      fields: [publicUrlField(bucket.publicUrl)],
      confirm: 'common.save'
    }
    const values = await firstValueFrom(this.dialog.open(FieldsDialog, { data }).afterClosed())
    const url = values ? normalizePublicUrl((values as string[])[0]) : null
    if (url && url !== bucket.publicUrl) {
      this.session.setBuckets(
        account.buckets.map((b) => (b.name === bucket.name ? { ...b, publicUrl: url } : b))
      )
      this.notify.info('settings.public_url_saved')
    }
  }

  protected async removeBucket(name: string) {
    const account = this.account()
    if (!account) {
      return
    }
    const data: ConfirmData = {
      title: 'settings.remove_bucket',
      message: 'settings.remove_bucket_message',
      params: { bucket: name },
      confirm: 'settings.remove_bucket'
    }
    if (await firstValueFrom(this.dialog.open(ConfirmDialog, { data }).afterClosed())) {
      this.session.setBuckets(account.buckets.filter((b) => b.name !== name))
    }
  }

  protected signOut() {
    this.dialog
      .open(SignOutDialog, { width: '26rem' })
      .afterClosed()
      .subscribe((keep?: boolean) => {
        if (keep !== undefined) {
          this.session.signOut(keep)
          void this.router.navigateByUrl('/login')
        }
      })
  }
}
