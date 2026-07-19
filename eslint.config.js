import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['dist/', 'node_modules/', 'public/', '*.config.*'],
    },
    ...tseslint.configs.recommended,
    solid.configs['flat/recommended'],
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            // Pre-existing Array#map over static option arrays; downgraded to a warning
            // like no-explicit-any.
            'solid/prefer-for': 'warn',
        },
    },
    prettier,
);
