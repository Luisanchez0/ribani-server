import { IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  @Length(6, 8)
  @Matches(/^\d+$/, {
    message: 'El código debe contener solo dígitos.',
  })
  code!: string;
}
