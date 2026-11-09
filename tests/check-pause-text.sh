#!/usr/bin/env bash
# shellcheck disable=SC2016
set -u; f=${1:?prompt file path}; fail=0
joined=$(tr '\n' ' ' < "$f")
# need: the pattern must match the file joined into one line; a leading `!`
# inverts it (the pattern must not match anywhere). needline: one line must match.
need() {
  if [ "${2#!}" != "$2" ]; then
    if printf '%s' "$joined" | /bin/grep -qE "${2#!}"; then echo "present: $1"; fail=1; fi
  else
    printf '%s' "$joined" | /bin/grep -qE "$2" || { echo "missing: $1"; fail=1; }
  fi
}
needline() { /bin/grep -qE "$2" "$f" || { echo "missing: $1"; fail=1; }; }
if [ "$(basename "$f")" = SKILL.md ]; then
need 'paused case' 'controller returned paused'
need 'hold defers dispatch only' 'cleanup at once|cleanup .* at once'
need 'held return line' 'Paused by user after <unit>'
need 'pause requested line' 'Section N: pause requested'
need 'mirror rule' 'Stopped by user mid-unit <N>'
need 'own stops consumed' 'stops the driver issued'
need 'superseded attempt' 'superseded attempt'
need 'drift ruling asked under hands-off' 'under hands-off too'
need 'owner words' '`pause`, `continue` and `abort`'
need 'bare stop' 'bare `stop`'
need 'step prompt wins' 'step.*prompt.*wins|answer wins'
need 'resume grep has paused' 'complete\|parked\|blocked\|paused'
need 'uncommitted exemption' 'paths of an incomplete attempt'
need 'waiting case' 'controller returned waiting'
need 'relay' 'relayed .* hand-back to controller'
needline 'release on continue' 'every `continue`.*Section N: pause released'
need 'owner note line' 'Section N: owner note: <text>'
needline 'nothing forwarded' 'pause requested.*forward nothing'
need 'no forwarded pause' '!forward the word'
needline 'incomplete attempt' 'handed to controller.*(no|without).*complete'
need 'resume grep has released' 'pause requested\|pause released\|resumed'
needline 'relaunch releases' 'relaunch.*Section N: pause released'
needline 'waiting child killed relayed' 'killed.*or.*failed.*notification for that child'
needline 'drift stop is abort' 'stop.*drift question.*abort|answer.*stop.*abort'
need 'mirror on status' 'status killed'
need 'no still paused framing' '!still paused: answer in your block'
needline 'complete held under a request' '`complete` or `parked`: .*Then next unit[^;]*request is in force[^;]*held'
needline 'continue makes the deferred dispatch' 'every `continue`.*or make the dispatch, or ask again the question, that the pause deferred.*nothing to resume'
needline 'resume grep has handed to controller' 'pause released\|resumed\|handed to controller\)'
needline 'final hold defers' '`complete` or `parked`: .*Then next unit[^;]*\(in the final phase, `scripts/run-archive`, the final message and the hands-off push and request wait in its place, and on `continue` the driver ledgers `Final phase: pause released` and then runs them in the usual order\).*defers the next dispatch only \(in the final phase with no dispatch left, `scripts/run-archive`, the final message and the hands-off push and request in its place\)'
need 'relaunch runs deferred steps' 'relaunch whose ledger shows the final phase held \(`Paused by user after the final phase` with no `Final phase: pause released` after it\) writes that release and then runs the steps the hold deferred[^.]*for a plan and for an OpenSpec change alike'
need 'all_done after deferred steps' '`all_done`: with a `Final phase: complete <sha7>` ledger line at the current HEAD, first release a held final phase and run the steps its hold deferred \(This machine, item 1\), then render the table'
needline 'ack with no unit live' 'with none live, "pause requested; nothing is dispatched until `continue`"\) and end the turn; forward nothing'
needline 'ack with a unit live' 'say "pause requested; the unit pauses when its current implementer or reviewer reports"'
need 'note carry rule' 'owner note: <text>` \(with none live, for the next unit\), which its controller reads before every dispatch and before the tick and applies at the note.s first carry to an implementer'
needline 'archive points to final hold' 'Either way, once item 3 has acted on the return \(a held return only on `continue`, after the `Final phase: pause released` line\), run `scripts/run-archive <ws>`'
needline 'push points to final hold' 'After a final phase that returned `complete`, once the driver loop.s item 3 has acted on the return \(a held return only on `continue`, after the `Final phase: pause released` line\): `git push -u <remote> <branch>`'
exit $fail
fi
needline 'Pause bullet' '^- \*\*Pause\.\*\*'
need 'status list' 'Status: complete \| parked \| needs-ruling \| failed \| paused \| waiting'
needline 'Point line' '^  Point: <one line, only with paused>'
needline 'Child line' '^  Child: <id> <role> <report path>, only with waiting'
needline 'forced hand-back is waiting' 'forced.*hand-back.*waiting|hand-back enforce.*waiting'
needline 'check before every dispatch' "grep -nE '\^\(Section N\|Final phase\): \(pause \(requested\|released\)\|owner note\)'"
needline 'latest pause line wins' 'latest.*wins'
need 'owner note applied line' 'Section N: owner note applied'
need 'checkpoint script' 'sdd-checkpoint'
needline 'stop keyed on status' 'status killed.*no result|killed.*no <result>'
need 'no summary match' '!stopped by (user|Claude)'
needline 'tick wins' 'tick.*complete.*whatever'
need 'needs-ruling takes checkpoint' 'checkpoint before returning `needs-ruling`'
need 'stopped by hand line' 'Section N: <role> stopped by hand'
need 'drift line' 'Section N: drift on resume'
need 'resumed line' 'Section N: resumed'
need 'replacement framing' 'stopped mid-work'
need 'round count unchanged' 'fix-round count does not advance'
need 'final phase prefix' 'Final phase:.*prefix'
need 'grep pattern has paused' 'grep -nE .*paused'
need 'notes held for the rest of the unit' 'every +owner +note +of +the +unit +in +every +later +dispatch +and +every +resume'
need 'note applied at its first carry' 'owner +note +applied`[^.]*first +carry'
need 'done work is a fix round' 'already +done +is +applied +as +a +fix +round[^.]*counts +toward +the +cap'
need 'notes read before the tick' 'Before +the +tick[^.]*owner +notes[^.]*pause +lines +still +do +not +stop +the +tick[^.]*unapplied +note +becomes +a +fix +round'
need 'no single-dispatch note' '!dispatch +or +resume +that +follows'
need 'stall needs an open finding' 'count +test +applies +only +while[^.]*at +least +one +Critical +or +Important +finding +open[^.]*leaves +none +open +closes +the +round +as +addressed'
need 'note loop baseline' 'loop +that +an +owner +note +opened +after +a +clean +review[^.]*first +re-review +is +the +baseline'
need 'applied at implementer carry' 'owner +note +applied`[^.]*first +carry +to +an +implementer'
need 'reviewer carries as context' 'reviewer[^.]*dispatch +carries[^.]*notes +as +context +only'
need 'final note wins' 'owner +note +wins +over +the +one-wave +limit[^.]*no +review +findings'
need 'one re-review spans' 'after +the +fix +dispatch[^.]*one +note +dispatch[^.]*one +scoped +re-review +then +covers +both +dispatches[^.]*from +the +head +the +whole-branch +review +saw'
need 'late note own re-review' 'note +found +unapplied +by +the +read +before +the +tick[^.]*no +fix +wave[^.]*one +note +dispatch[^.]*one +scoped +re-review +of +that +dispatch[^.]*gates +again'
need 'note finding is a leftover' "finding +a +note's +re-review +raises +is +a +leftover[^.]*opens +no +further +round"
need 'tick read points to final phase' 'unapplied +note +becomes +a +fix +round[^.]*\(in +the +final +phase, +the +Final +phase +bullet[^ ]* +note +path\)'
exit $fail
