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

    const refreshButton = isPublic ? {
        type: 'button' as const,
        appId: APP_ID,
        blockId: 'refresh-button-block-id',
        actionId: Poll.PollRefresh,
        value: uuid,
        text: {
            type: 'plain_text' as const,
            text: t('refresh_results'),
            emoji: true,
        },
    } : null;

    return { optionButtons, cancelButton, refreshButton };
}

export function buildVoteDisplay(
    options: string[],
    responses: { [key: string]: string[] },
    isPublic: boolean
): string {
    if (!isPublic) return '';

    const sanitize = (text: string) => text.replace(/[*_`~]/g, '');

    if (options.length === 2) {
        const opt1 = sanitize(options[0]);
        const opt2 = sanitize(options[1]);
        return `**Votes:** ${opt1}: ${responses[options[0]]?.length || 0} | ${opt2}: ${responses[options[1]]?.length || 0}`;
    } else {
        const lines = options.map((opt) => `• ${sanitize(opt)}: ${responses[opt]?.length || 0}`);
        return `**Votes:**\n${lines.join('\n')}`;
    }
}
