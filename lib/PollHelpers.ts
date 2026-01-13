import { Poll } from '../definitions/PollProps';
import { t } from '../i18n/translation';

const APP_ID = 'a056c6fd-b2ca-4db8-8c54-0f206a4bf7ae';

export function createPollButtons(options: string[], uuid: string, isPublic: boolean = false) {
    const optionButtons = options.map((opt, index) => ({
        type: 'button' as const,
        appId: APP_ID,
        blockId: `option-${index}-block-id`,
        actionId: Poll.PollVote,
        value: JSON.stringify({ uuid, option: opt }),
        text: {
            type: 'plain_text' as const,
            text: opt,
            emoji: true,
        },
    }));

    const cancelButton = {
        type: 'button' as const,
        appId: APP_ID,
        blockId: 'cancel-button-block-id',
        actionId: Poll.PollCancel,
        value: uuid,
        text: {
            type: 'plain_text' as const,
            text: t('cancel_poll'),
            emoji: true,
        },
        style: 'danger' as const,
    };

    return { optionButtons, cancelButton };
}

const BAR_LENGTH = 20;
const CHAR_FILLED = '█';
const CHAR_EMPTY = ' ';

function generateProgressBar(count: number, total: number): string {
    const percentage = total === 0 ? 0 : Math.round((count / total) * 100);
    const filledLength = Math.round((percentage / 100) * BAR_LENGTH);
    const emptyLength = BAR_LENGTH - filledLength;

    const bar = CHAR_FILLED.repeat(filledLength) + CHAR_EMPTY.repeat(emptyLength);
    return `\`${bar}\` ${percentage}% (${count})`;
}

export function buildVoteDisplay(
    options: string[],
    responses: { [key: string]: string[] },
    isPublic: boolean
): string {
    if (!isPublic) return '';

    const sanitize = (text: string) => text.replace(/[*_`~]/g, '');

    let totalVotes = 0;
    for (const opt of options) {
        totalVotes += (responses[opt] || []).length;
    }

    const lines = options.map((opt) => {
        const count = (responses[opt] || []).length;
        const progressBar = generateProgressBar(count, totalVotes);
        return `**${sanitize(opt)}**: ${progressBar}`;
    });

    return `\n${lines.join('\n')}\n\nTotal votes: ${totalVotes}`;
}
