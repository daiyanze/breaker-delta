# 已确认的管理端文案对照表

这是 2026-11-21 确认的英、中、日三语文案，按出现位置排列。`[ ]` 里是运行时填入的值。键名和完整文案见同目录的 JSON 文件；两者不一致时以 JSON 为准。

## 管理端登录页和首次设置的文案（已确认）

下面 34 条是画板 45、46 新增的文案，三种语言已在 11 月 21 日确认，并接到了这两块画板的语言切换里。「编辑台」「デスク」沿用管理端现有的译法；`[ ]` 里是运行时填入的值。

| 位置 | English | 中文 | 日本語 |
| --- | --- | --- | --- |
| 登录：标题 | Open the desk | 打开编辑台 | デスクを開く |
| 登录：说明 | The desk is where verdicts, corrections and settings are made. Readers never see it. | 编辑台是下结论、发更正、改设置的地方，读者看不到。 | デスクでは判定・訂正・設定を行います。読者には表示されません。 |
| 登录：输入框标签 | Desk password | 编辑台密码 | デスクのパスワード |
| 登录：按钮 | Open the desk | 打开编辑台 | デスクを開く |
| 登录：忘记密码 | Forgot it? The password is set in the configuration file of your installation; there is no reset by email. | 忘了？密码写在这次安装的配置文件里，不能通过邮件重置。 | お忘れですか？パスワードはこの環境の設定ファイルで指定します。メールでの再設定はできません。 |
| 登录：密码错误 | That password is not right. [4] attempts left before a 15 minute pause. | 密码不对。还能再试 [4] 次，之后会暂停 15 分钟。 | パスワードが違います。あと [4] 回間違えると 15 分間入力できなくなります。 |
| 登录：尝试太多 | Too many attempts. Try again at [14:32]. | 尝试次数太多。请在 [14:32] 之后再试。 | 試行回数が上限に達しました。[14:32] 以降にもう一度お試しください。 |
| 登录：仅本机 | Opened from this computer. No password is needed. | 你是从本机打开的，不需要密码。 | このコンピューターから開いています。パスワードは不要です。 |
| 登录：仅本机，从别处访问 | The desk only opens on the computer it runs on. | 编辑台只能在运行它的那台电脑上打开。 | デスクは、動作しているコンピューターからのみ開けます。 |
| 登录：进入按钮 | Go to the desk | 进入编辑台 | デスクへ進む |
| 登录：Cloudflare Access | Signed in through Cloudflare Access as [account]. | 已通过 Cloudflare Access 登录：[account]。 | Cloudflare Access でログインしました：[account] |
| 登录：登录代理 | Signed in through your proxy as [account]. | 已通过登录代理登录：[account]。 | 認証プロキシ経由でログインしました：[account] |
| 登录：不在名单上 | [account] is not on the list of people who can open the desk. | [account] 不在可以打开编辑台的名单上。 | [account] はデスクを開けるメンバーに含まれていません。 |
| 登录：不在名单上，提示 | Ask whoever runs this installation to add you in Settings. | 请让运行这个站点的人在设置里把你加上。 | この環境の管理者に、設定で追加するよう依頼してください。 |
| 设置：标题 | Set up your own Breaker Delta | 设置你自己的浪尖 | あなたの波頭をセットアップ |
| 设置：说明 | Four steps. Nothing is published until the first scan finishes, and every choice can be changed later in Settings. | 一共四步。第一次扫描完成之前不会公开任何内容，每一项之后都能在设置里改。 | 全部で 4 ステップです。最初のスキャンが終わるまで何も公開されません。どの項目も後から設定で変更できます。 |
| 设置：左侧说明 | Delta the cat will mind the stand once this is done. It takes about five minutes. | 设置好之后，黑猫 Delta 会替你看着报摊。大约需要五分钟。 | セットアップが終われば、猫の Delta が店番をします。所要時間は 5 分ほどです。 |
| 设置：步骤状态 | Done / Step [2] of 4 / Not yet | 已完成 / 第 [2] 步，共 4 步 / 未开始 | 完了 / ステップ [2]（4 中）/ 未着手 |
| 设置：第 1 步 | Who can open the desk | 谁能打开编辑台 | デスクを開ける人 |
| 设置：修改链接 | Change | 修改 | 変更 |
| 设置：第 2 步 | Who writes the summaries | 谁来写摘要 | 要約を書くモデル |
| 设置：第 2 步说明 | Summaries and the 14-day calls are written by a language model. Headlines are never rewritten. Your key stays on this installation. | 摘要和 14 天判断由语言模型来写，标题从不改写。你的密钥只保存在这次安装里。 | 要約と 14 日後の予測は言語モデルが書きます。見出しは書き換えません。キーはこの環境にのみ保存されます。 |
| 设置：服务商标签 | Provider | 服务商 | プロバイダー |
| 设置：本地模型选项 | A local model | 本地模型 | ローカルモデル |
| 设置：不使用选项 | None: no summaries, headlines only | 不使用：没有摘要，只显示标题 | 使わない：要約なし、見出しのみ |
| 设置：密钥标签 | API key | API 密钥 | API キー |
| 设置：测试成功 | The key works. A test summary came back in [2.1] seconds. | 密钥可用。测试摘要在 [2.1] 秒内返回。 | キーは有効です。テスト要約が [2.1] 秒で返りました。 |
| 设置：保存按钮 | Save and continue | 保存并继续 | 保存して次へ |
| 设置：重测按钮 | Test the key again | 再测一次密钥 | キーを再テスト |
| 设置：第 3 步 | Which sources to read | 读哪些数据源 | 読み込むソース |
| 设置：第 3 步说明 | A starter set of [8] source groups is ready. You will be able to switch groups off or add your own. | 已经准备好一套 [8] 组的初始数据源，你可以关掉其中几组，也可以加自己的。 | [8] グループの初期ソースを用意しています。不要なグループをオフにしたり、独自のソースを追加したりできます。 |
| 设置：第 4 步 | Run the first scan | 运行第一次扫描 | 最初のスキャンを実行 |
| 设置：第 4 步说明 | The first scan takes a few minutes. When it ends, your front page is live. | 第一次扫描需要几分钟。结束后，你的头版就上线了。 | 最初のスキャンには数分かかります。終わると一面が公開されます。 |
| 设置：底部说明 | If the key fails the test, this step stays open and says why: wrong key, no credit, or the provider did not answer. You can skip summaries and add a key later. | 如果密钥没通过测试，这一步会停在这里并说明原因：密钥不对、余额不足，或者服务商没有响应。你可以先跳过摘要，以后再加密钥。 | キーのテストに失敗すると、このステップにとどまり、理由（キーの誤り、残高不足、プロバイダーから応答なし）を表示します。要約はスキップして、キーを後から追加することもできます。 |

## 管理端 Mail 页签的文案（已确认）

下面是画板 49 的界面文案，三种语言已在 11 月 21 日确认，并接到了画板的语言切换里。`[ ]` 里是运行时填入的值。版次名沿用邮件里的叫法：晨间版、每周版。

| 位置 | English | 中文 | 日本語 |
| --- | --- | --- | --- |
| 页签名 | Mail | 邮件 | メール |
| 下一版：标题 | The next edition | 下一版 | 次の号 |
| 下一版：说明 | Editions are written from the edition’s data at the moment they are sent. Nobody composes them. | 版次邮件在发送的那一刻由当版数据生成，不需要人来写。 | 各号のメールは、送信時点のデータから自動で作られます。手で書く必要はありません。 |
| 下一版：方框标题 | The morning edition, tomorrow at [08:00] | 晨间版，明天 [08:00] | 朝刊、明日 [08:00] |
| 下一版：方框副文 | To [1,284] people. [Asia/Tokyo] time. | 发给 [1,284] 人，按 [Asia/Tokyo] 时间。 | [1,284] 人に送信。[Asia/Tokyo] 時間。 |
| 按钮 | Preview | 预览 | プレビュー |
| 按钮 | Send me a test | 给我发一封测试 | 自分にテスト送信 |
| 按钮 | Hold this edition / Release | 扣住这一版 / 放行 | この号を保留 / 保留を解除 |
| 下一版：小字 | A held edition is skipped, not delayed: the next one goes out as usual, and the hold is recorded below. | 被扣住的一版会跳过，不会补发；下一版照常发出，扣住这件事会记在下面的发送记录里。 | 保留した号は延期ではなくスキップされます。次の号は通常どおり送信され、保留は下の送信履歴に残ります。 |
| 写邮件：标题 | Write an email | 写邮件 | メールを書く |
| 写邮件：说明 | For things subscribers need to hear from you: an outage, a mistake in an email already sent, a change to the service, an announcement. The editions still write themselves. | 用于需要你亲自告诉订阅者的事：故障、已发邮件里的错误、服务变更、公告。版次邮件仍然自动生成。 | 購読者に直接伝えるべきこと（障害、送信済みメールの誤り、サービスの変更、お知らせ）のための機能です。各号のメールはこれまでどおり自動で作られます。 |
| 写邮件：收件人 | To | 发给 | 宛先 |
| 写邮件：收件范围 | Everyone who confirmed: [1,696] people / Morning edition only / Weekly edition only | 所有已确认的人：[1,696] 人 / 只发晨间版订阅者 / 只发每周版订阅者 | 確認済みの全員：[1,696] 人 / 朝刊の購読者のみ / 週刊の購読者のみ |
| 写邮件：主题 | Subject | 主题 | 件名 |
| 写邮件：正文 | Message | 正文 | 本文 |
| 写邮件：发送按钮 | Send to [1,696] people | 发给 [1,696] 人 | [1,696] 人に送信 |
| 写邮件：小字 | A template fixes the layout, so a hand-written email looks like the editions. You fill in words only. The message takes bold, links and lists, nothing else. A language left empty gets the English text. A sent email cannot be recalled. | 模板固定了版式，所以手写的邮件和版次邮件是一个样子。你只需要填文字。正文只支持加粗、链接和列表。某种语言没填时发英文。发出后不能撤回。 | テンプレートがレイアウトを決めるので、手書きのメールも各号と同じ見た目になります。入力するのは文章だけです。本文で使えるのは太字・リンク・リストのみです。未入力の言語には英語版が届きます。送信後の取り消しはできません。 |
| 投递：标题 | Delivery | 投递 | 配信設定 |
| 投递：说明 | How email leaves this installation. Pick one; the rest of Breaker Delta does not care which. | 邮件从这次安装发出去的方式。选一种即可，其他功能不受影响。 | この環境からメールを送る方法です。ひとつ選んでください。他の機能には影響しません。 |
| 投递：方式 | Send with | 投递方式 | 送信方法 |
| 投递：选项 | Cloudflare Email Sending / An SMTP server / Off: no email, the subscribe form is hidden | Cloudflare Email Sending / SMTP 服务器 / 关闭：不发邮件，订阅表单隐藏 | Cloudflare Email Sending / SMTP サーバー / オフ：メールを送らず、購読フォームを隠す |
| 投递：字段 | From name / From address / Replies go to | 发件人名称 / 发件地址 / 回信地址 | 差出人名 / 差出人アドレス / 返信先 |
| 投递：字段 | Daily edition at / Weekly edition on / Time zone | 晨间版发送时间 / 每周版发送日 / 时区 | 朝刊の送信時刻 / 週刊の送信曜日 / タイムゾーン |
| 投递：域名检查 | Domain check / SPF passes / DKIM passes / DMARC passes / Checked today at [07:55] / Check again | 域名检查 / SPF 通过 / DKIM 通过 / DMARC 通过 / 今天 [07:55] 检查过 / 再检查一次 | ドメイン確認 / SPF 合格 / DKIM 合格 / DMARC 合格 / 本日 [07:55] に確認 / 再確認 |
| 投递：小字 | With “An SMTP server”, four more fields appear: host, port, user name and password. If a check fails, the line turns red and says which DNS record to add. | 选「SMTP 服务器」时会多出四个输入框：主机、端口、用户名、密码。某项检查没通过时，这一行会变红并说明该加哪条 DNS 记录。 | 「SMTP サーバー」を選ぶと、ホスト・ポート・ユーザー名・パスワードの 4 項目が追加されます。確認に失敗するとその行が赤くなり、追加すべき DNS レコードが表示されます。 |
| 投递：保存 | Save delivery settings | 保存投递设置 | 配信設定を保存 |
| 发送记录：标题 | Recent sends | 最近的发送 | 最近の送信 |
| 发送记录：说明 | One line per edition, newest first. Failed means the delivery service refused it and we will retry; bounced means the address does not work. | 每版一行，最新的在前。「失败」是投递服务拒收，会重试；「退信」是这个地址收不到。 | 1 号につき 1 行、新しい順です。「失敗」は配信サービスに拒否されたもので再試行します。「バウンス」はアドレスが無効なものです。 |
| 发送记录：表头 | Edition / Sent / To / Delivered / Failed / Bounced / State | 版次 / 发送时间 / 发给 / 送达 / 失败 / 退信 / 状态 | 号 / 送信日時 / 宛先数 / 到達 / 失敗 / バウンス / 状態 |
| 发送记录：状态 | Sent / Retrying [14] / Held by the desk | 已发送 / 正在重试 [14] 封 / 被编辑台扣住 | 送信済み / [14] 件を再試行中 / デスクが保留 |
| 发送记录：版次名 | The morning edition / The weekly edition / Notice: [subject] | 晨间版 / 每周版 / 通知：[主题] | 朝刊 / 週刊 / お知らせ：[件名] |
| 订阅者：标题 | Subscribers | 订阅者 | 購読者 |
| 订阅者：说明 | Counts, one person at a time, and a way to add people by hand. | 人数、逐个查人，以及手动加人的入口。 | 人数の確認、個別の検索、手動での追加ができます。 |
| 订阅者：计数 | get the morning edition / get the weekly edition / have not confirmed yet / paused after 3 bounces | 订阅晨间版 / 订阅每周版 / 尚未确认 / 连续 3 次退信后暂停 | 朝刊を購読 / 週刊を購読 / 未確認 / 3 回のバウンスで停止中 |
| 订阅者：查找 | Find one person by email address / Find | 按邮箱地址查一个人 / 查找 | メールアドレスで 1 人を検索 / 検索 |
| 订阅者：导出全部 | Export the whole list as CSV | 把整个名单导出为 CSV | リスト全体を CSV で書き出す |
| 订阅者：个人信息 | Morning edition, in English. Subscribed and confirmed [Nov 3]. Last delivered today at [08:00]. No bounces. | 晨间版，英文。[11 月 3 日] 订阅并确认。最近一次送达：今天 [08:00]。没有退信。 | 朝刊、英語。[11月3日] に購読・確認。最終到達：本日 [08:00]。バウンスなし。 |
| 订阅者：操作 | Export this person’s data / Delete this person / Resume sending | 导出这个人的数据 / 删除这个人 / 恢复发送 | この人のデータを書き出す / この人を削除 / 送信を再開 |
| 订阅者：删除说明 | Delete asks once more before it acts, removes the address at once and writes a line to the history with the time but not the address. | 删除前会再确认一次，确认后立即删除，历史里只记时间、不记邮箱。 | 削除の前にもう一度確認します。削除はすぐに反映され、履歴には日時だけが残り、アドレスは残りません。 |
| 手动添加：标题 | Add people by hand | 手动加人 | 手動で追加 |
| 手动添加：说明 | For readers who could not get through the form: a confirmation email that never arrived, a mail filter, someone who asked you directly. | 给没能通过表单订阅的读者用：确认邮件没收到、被邮件过滤拦了，或者直接找你要求加入的人。 | フォームから購読できなかった読者のための機能です。確認メールが届かない、フィルターに弾かれた、直接依頼された、などの場合に使います。 |
| 手动添加：字段 | Email addresses, one per line / Edition / Email language | 邮箱地址，每行一个 / 版次 / 邮件语言 | メールアドレス（1 行に 1 件）/ 号 / メールの言語 |
| 手动添加：方式标题 | How to add them | 怎么加 | 追加の方法 |
| 手动添加：方式一 | Send each a confirmation email. They join when they open the link. The safe choice. | 给每个人发确认邮件。他们点开链接后才算加入。这是稳妥的选法。 | 各自に確認メールを送る。リンクを開いた時点で購読が始まります。安全な方法です。 |
| 手动添加：方式二 | Add as confirmed, without an email. Only for people who asked you to. | 不发邮件，直接计为已确认。只用于主动要求你加入的人。 | メールを送らず、確認済みとして追加する。本人から依頼があった場合に限ります。 |
| 手动添加：勾选确认 | Each of these people asked to be added | 这些人都要求过加入 | 全員から追加の依頼を受けています |
| 手动添加：按钮 | Add [3] people | 添加 [3] 人 | [3] 人を追加 |
| 手动添加：小字 | Up to 200 addresses at a time. Addresses already on the list are skipped and listed. Each one added this way is marked “added by the desk” with the date and who did it. Their first email says who added them and has the unsubscribe link at the top. | 一次最多 200 个地址。已经在名单上的会跳过并列出来。这样加入的每个地址都会标记「由编辑台添加」，并记下日期和操作人。他们收到的第一封邮件会写明是谁加的，顶部有退订链接。 | 一度に追加できるのは 200 件までです。すでにリストにあるアドレスはスキップされ、一覧で表示されます。この方法で追加したアドレスには「デスクが追加」と記録され、日付と操作者が残ります。最初のメールには追加した人が明記され、冒頭に配信停止リンクが付きます。 |

「写邮件」一块和四个模板（画板 50）新增的文案：

| 位置 | English | 中文 | 日本語 |
| --- | --- | --- | --- |
| 模板：标签 | Template | 模板 | テンプレート |
| 模板：名称 | Notice / Correction / Announcement / Letter | 通知 / 更正 / 公告 / 信件 | お知らせ / 訂正 / ご案内 / 手紙 |
| 模板：说明 | Something went wrong or will be down. / An email we sent was wrong. / Something new or changing. / Words only, no headline block. | 出了问题，或者将要停机。/ 我们发过的邮件有误。/ 有新东西，或者有变化。/ 只有文字，没有标题块。 | 障害や停止のお知らせ。/ 送信したメールに誤りがあった。/ 新機能や変更の案内。/ 文章のみ。見出しブロックなし。 |
| 语言页签 | English, [1,402] people | 英文，[1,402] 人 | 英語、[1,402] 人 |
| 字段：标题 | Headline | 标题 | 見出し |
| 工具栏 | Bold / Link / List | 加粗 / 链接 / 列表 | 太字 / リンク / リスト |
| 字段：按钮 | Button label, optional / Button link | 按钮文字（可不填）/ 按钮链接 | ボタンの文言（任意）/ ボタンのリンク先 |
| 预览标签 | Preview, as it will arrive | 预览（收到时的样子） | プレビュー（届いたときの見え方） |
| 更正模板：字段 | We wrote / It should say | 我们原来写的是 / 应该是 | 誤 / 正 |
| 信件模板：字段 | Greeting / Sign-off | 称呼 / 落款 | 書き出し / 結び |
| 邮件里的标签 | A notice from the desk / Correction / New at Breaker Delta | 编辑台通知 / 更正 / 浪尖有新变化 | デスクからのお知らせ / 訂正 / 波頭からのご案内 |
| 信件模板：默认落款 | The desk | 编辑台 | デスクより |
| 模板来源说明 | Templates are files in the installation’s templates folder, built with React Email, the same components the editions use. Four come with Breaker Delta; anyone running their own copy can add more, and they show up here. The fields on the left change with the template. | 模板是安装目录 templates 文件夹里的文件，用 React Email 编写，和版次邮件用的是同一套组件。浪尖自带四个，自建的人可以自己再加，加了就会出现在这里。左边的输入项随模板变化。 | テンプレートは、この環境の templates フォルダーにあるファイルで、React Email で書かれており、各号のメールと同じコンポーネントを使います。波頭には 4 つ付属し、自分で運用する場合は追加でき、追加するとここに表示されます。左の入力項目はテンプレートによって変わります。 |
